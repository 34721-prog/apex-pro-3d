import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { Race, collisionParticipants } from "../src/race.js";
import { defaults, validateSave } from "../src/save.js";
import { BASE } from "../src/physics.js";
import { configureTrack } from "../src/track.js";
import {
  assertRaceLaps,
  clampRaceLaps,
  MAX_GRID_CARS,
  MAX_RACE_LAPS,
  MIN_RACE_LAPS,
  validateRoomSettings,
} from "../src/racing/RaceConfig.js";
import {
  applyInterpolatedState,
  INPUT_INTERVAL_MS,
  isValidRaceSnapshot,
  makeRaceSnapshot,
  MAX_PACKET_BYTES,
  measurePacketBytes,
  SNAPSHOT_INTERVAL_MS,
  validateRaceInput,
} from "../src/multiplayer/NetworkProtocol.js";
import { MultiplayerClient } from "../src/multiplayer/MultiplayerClient.js";
import { isGoogleIdentity } from "../src/multiplayer/supabase.js";

const RACE_ID = "74a2a023-270f-4e53-923e-e99bbbc5ca4d";
const HOST_ID = "54a1a023-270f-4e53-923e-e99bbbc5ca4d";
const GUEST_ID = "64a1a023-270f-4e53-923e-e99bbbc5ca4d";
const ROOM_ID = "44a1a023-270f-4e53-923e-e99bbbc5ca4d";

function roomSettings(overrides = {}) {
  return {
    name: "Sala de teste",
    visibility: "private",
    trackId: "aurora",
    lapCount: MIN_RACE_LAPS,
    maxPlayers: 2,
    botCount: 4,
    ...overrides,
  };
}

function networkRace({ authoritative, localCarId }) {
  configureTrack("aurora");
  const remoteInputs = new Map();
  const remoteInputAt = new Map();
  const race = new Race({
    difficulty: "normal",
    laps: MIN_RACE_LAPS,
    stats: BASE,
    specStats: BASE,
    botCount: 2,
    delegated: false,
    network: {
      authoritative,
      localPlayerId: localCarId === 0 ? HOST_ID : GUEST_ID,
      hostPlayerId: HOST_ID,
      remoteInputs,
      remoteInputAt,
    },
  });
  for (const [index, car] of race.cars.entries()) {
    car.networkEntityId = index < 2
      ? `player:${index === 0 ? HOST_ID : GUEST_ID}`
      : `bot:${index - 2}`;
    car.isNetworkHuman = index < 2;
    car.isNetworkLocal = index === localCarId;
  }
  race.localCarId = localCarId;
  race.network.localCarId = localCarId;
  race.state = "racing";
  return race;
}

test("online lap setting is exactly 8 minimum, preserves max 30 and migrates old saves", () => {
  assert.equal(MIN_RACE_LAPS, 8);
  assert.equal(MAX_RACE_LAPS, 30);
  assert.equal(clampRaceLaps(1), 8);
  assert.equal(clampRaceLaps("3"), 8);
  assert.equal(clampRaceLaps(30), 30);
  assert.equal(clampRaceLaps(99), 30);
  assert.throws(() => assertRaceLaps(7), RangeError);
  assert.equal(assertRaceLaps(8), 8);
  assert.equal(defaults().settings.laps, 8);
  assert.equal(
    validateSave({
      ...defaults(),
      settings: { ...defaults().settings, laps: 3 },
    }).settings.laps,
    8,
  );
  assert.equal(
    validateSave({
      ...defaults(),
      settings: { ...defaults().settings, laps: 80 },
    }).settings.laps,
    30,
  );
  assert.equal(validateRoomSettings(roomSettings()).lapCount, 8);
  assert.throws(() => validateRoomSettings(roomSettings({ lapCount: 7 })), RangeError);
  assert.throws(() => validateRoomSettings(roomSettings({ lapCount: 31 })), RangeError);
  assert.throws(
    () => validateRoomSettings(roomSettings({ maxPlayers: MAX_GRID_CARS + 1 })),
    RangeError,
  );
});

test("every shared distance preset used for player launches respects eight laps", async () => {
  const { RACE_DISTANCE_PRESETS } = await import("../src/race.js");
  for (const preset of Object.values(RACE_DISTANCE_PRESETS))
    if (Number.isInteger(preset.laps)) assert.ok(preset.laps >= 8);
});

test("race snapshots include bounded race/car telemetry and fit the Realtime packet budget", () => {
  const race = networkRace({ authoritative: true, localCarId: 0 });
  race.state = "racing";
  race.countdown = 0;
  const snapshot = makeRaceSnapshot(race, RACE_ID, 1);
  assert.equal(snapshot.cars.length, 3);
  assert.equal(isValidRaceSnapshot(snapshot, RACE_ID), true);
  assert.ok(measurePacketBytes(snapshot) <= MAX_PACKET_BYTES);
  assert.ok(snapshot.cars.every((car) => car.pit && car.tireCompound && Number.isFinite(car.fuel)));
  assert.equal(INPUT_INTERVAL_MS, 50);
  assert.equal(SNAPSHOT_INTERVAL_MS, 50);

  const badSpeed = structuredClone(snapshot);
  badSpeed.cars[0].speed = 151;
  assert.equal(isValidRaceSnapshot(badSpeed, RACE_ID), false);
  const duplicate = structuredClone(snapshot);
  duplicate.cars[1].entityId = duplicate.cars[0].entityId;
  assert.equal(isValidRaceSnapshot(duplicate, RACE_ID), false);
  const badPit = structuredClone(snapshot);
  badPit.cars[0].pit.state = "teleport";
  assert.equal(isValidRaceSnapshot(badPit, RACE_ID), false);
  const badEvent = structuredClone(snapshot);
  badEvent.events = [{ id: 1, type: "start", entityId: "x", detail: "x".repeat(121), time: 0 }];
  assert.equal(isValidRaceSnapshot(badEvent, RACE_ID), false);
});

test("player input is allow-listed, race-bound and clamped before the host simulates it", () => {
  const allowed = new Set([HOST_ID, GUEST_ID]);
  assert.deepEqual(
    validateRaceInput({
      raceId: RACE_ID,
      playerId: GUEST_ID,
      seq: 4,
      input: { throttle: 1.8, brake: -1, steer: 0.45 },
    }, RACE_ID, allowed),
    {
      playerId: GUEST_ID,
      seq: 4,
      input: { throttle: 1, brake: 0, steer: 0.45 },
    },
  );
  assert.equal(
    validateRaceInput({ raceId: "wrong", playerId: GUEST_ID, seq: 1, input: {} }, RACE_ID, allowed),
    null,
  );
  assert.equal(
    validateRaceInput({ raceId: RACE_ID, playerId: "stranger", seq: 1, input: { throttle: 1, brake: 0, steer: 0 } }, RACE_ID, allowed),
    null,
  );
  assert.equal(
    validateRaceInput({ raceId: RACE_ID, playerId: GUEST_ID, seq: 1, input: { throttle: NaN, brake: 0, steer: 0 } }, RACE_ID, allowed),
    null,
  );
});

test("host simulates remote inputs while clients control the correctly ordered local car", () => {
  const now = performance.now();
  const hostRace = networkRace({ authoritative: true, localCarId: 0 });
  hostRace.network.remoteInputs.set(`player:${GUEST_ID}`, { throttle: 1, brake: 0, steer: 0 });
  hostRace.network.remoteInputAt.set(`player:${GUEST_ID}`, now);
  hostRace.step(1 / 60, { throttle: 0, brake: 0, steer: 0 });
  assert.equal(hostRace.localCar.id, 0);
  assert.ok(hostRace.cars[1].speed > 0, "host must apply the guest's validated input");

  const guestRace = networkRace({ authoritative: false, localCarId: 1 });
  const guestCollisionTraffic = collisionParticipants(
    guestRace.control.traffic,
    guestRace.network,
  );
  assert.ok(guestCollisionTraffic.includes(guestRace.localCar));
  assert.equal(guestRace.isLocalCar(guestRace.localCar), true);
  assert.ok(!guestRace.isLocalCar(guestRace.cars[0]));
  assert.ok(!guestCollisionTraffic.includes(guestRace.cars[0]));
  assert.ok(guestRace.cars.slice(2).every((car) => guestCollisionTraffic.includes(car)));
  guestRace.step(1 / 60, { throttle: 1, brake: 0, steer: 0 });
  assert.equal(guestRace.localCar.id, 1);
  assert.ok(guestRace.cars[1].speed > 0, "guest input must drive its own entity, not the host car");
  assert.equal(guestRace.cars[0].speed, 0, "a client must not simulate a remote human car");
});

test("snapshot interpolation wraps heading and synchronizes resources and pit status", () => {
  configureTrack("aurora");
  const car = new Race({ laps: 8, botCount: 0 }).cars[0];
  const previous = {
    x: 0, z: 0, heading: Math.PI - 0.1, speed: 20, s: 0, lateral: 0,
    progress: 0, vx: 1, vz: 0, lapTime: 10, lap: 1, bestLap: 90,
    finishTime: null, finished: false, retired: false, fuel: 40,
    fuelPerLap: 3, tireCompound: "medium", tireHealth: 0.8,
    tireTemperature: 90, damage: 0.1, wingDamage: 0, mechanical: 0,
    penalty: 0, throttle: 0.5, brake: 0, steer: 0,
    pit: { state: "track", requested: false, stops: 0, through: false, mergeWaiting: false },
    retirement: "",
  };
  const current = {
    ...previous,
    x: 10,
    heading: -Math.PI + 0.1,
    speed: 30,
    progress: 10,
    fuel: 38,
    tireHealth: 0.7,
    tireTemperature: 100,
    damage: 0.2,
    tireCompound: "soft",
    pit: { state: "queue", requested: true, stops: 1, through: false, mergeWaiting: true },
  };
  applyInterpolatedState(car, previous, current, 0.5);
  assert.ok(Math.abs(car.heading - Math.PI) < 0.01);
  assert.equal(car.x, 5);
  assert.equal(car.fuel, 39);
  assert.equal(car.tires.health, 0.75);
  assert.equal(car.tires.compound, "soft");
  assert.equal(car.pit.state, "queue");
  assert.equal(car.pit.requested, true);
});

test("multiplayer accepts only a real Google identity, not anonymous or email-only sessions", async () => {
  assert.equal(isGoogleIdentity({
    id: HOST_ID,
    is_anonymous: false,
    app_metadata: { provider: "google", providers: ["google"] },
  }), true);
  assert.equal(isGoogleIdentity({
    id: GUEST_ID,
    is_anonymous: true,
    app_metadata: { provider: "anonymous", providers: ["anonymous"] },
  }), false);
  assert.equal(isGoogleIdentity({
    id: GUEST_ID,
    is_anonymous: false,
    app_metadata: { provider: "email", providers: ["email"] },
    identities: [{ provider: "google" }],
  }), false, "the client uses the same signed app_metadata claim as the database gate");

  const calls = [];
  const client = {
    auth: {
      getSession: async () => ({
        data: { session: { user: {
          id: GUEST_ID,
          is_anonymous: true,
          app_metadata: { provider: "anonymous", providers: ["anonymous"] },
        } } },
        error: null,
      }),
    },
    from: () => { calls.push("profile-read"); throw new Error("must not read a guest profile"); },
    rpc: () => { calls.push("rpc"); throw new Error("must not call room RPCs as guest"); },
  };
  const game = {
    ui: { page: "multiplayer", render: () => calls.push("render"), toast() {} },
  };
  const multiplayer = new MultiplayerClient(game, { client, configured: true });
  await multiplayer.openMenu();
  assert.equal(multiplayer.state.googleIdentityRequired, true);
  assert.equal(multiplayer.state.anonymousSession, true);
  assert.equal(multiplayer.state.connection, "google-required");
  assert.equal(multiplayer.state.profile, null);
  assert.equal(multiplayer.state.room, null);
  assert.equal(multiplayer.state.publicRooms.length, 0);
  await assert.rejects(multiplayer.createRoom(roomSettings()), /Google/i);
  assert.equal(await multiplayer.handleAction("mp-google"), true);
  assert.match(multiplayer.state.error, /Configure o provedor Google/i);
  assert.equal(calls.includes("profile-read"), false);
  assert.equal(calls.includes("rpc"), false);
});

test("invite codes are exactly eight characters and survive room-state refreshes", async () => {
  const client = {
    rpc: async (name) => {
      if (name === "join_room")
        return { data: { id: ROOM_ID, code: "ABC12345" }, error: null };
      if (name === "get_room_state")
        return {
          data: {
            room: { id: ROOM_ID, host_id: HOST_ID, status: "results" },
            players: [],
            results: [],
          },
          error: null,
        };
      throw new Error(`Unexpected RPC: ${name}`);
    },
  };
  const game = { ui: { page: "multiplayer", render() {}, toast() {} } };
  const multiplayer = new MultiplayerClient(game, { client, configured: true });
  multiplayer.state.profile = { id: HOST_ID, isGoogle: true };
  multiplayer.attachRoom = async (id, code) => {
    multiplayer.activeRoomId = id;
    multiplayer.roomCode = code;
  };
  multiplayer.onRoomStateChanged = () => {};

  await assert.rejects(multiplayer.joinRoomByCode("ABC1234"), /8 caracteres/);
  await multiplayer.joinRoomById(ROOM_ID);
  assert.equal(multiplayer.state.room.code, "ABC12345");
});

test("database migration enables explicit RLS and restricts room broadcast identities", () => {
  const sql = fs.readFileSync("supabase/migrations/20261028211101_multiplayer.sql", "utf8");
  for (const table of ["profiles", "rooms", "room_players", "race_results"])
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  assert.match(sql, /can_send_room_event\(text, text, jsonb\)/);
  assert.match(sql, /v_body ->> 'playerId' is distinct from v_actor::text/);
  assert.match(sql, /r\.host_id = v_actor/);
  assert.match(
    sql,
    /create or replace function public\.begin_room_race[\s\S]*?v_room\.host_id <> auth\.uid\(\) then raise exception 'host_only'/,
  );
  const privilegeMigration = fs.readFileSync(
    "supabase/migrations/20261028211941_revoke_anon_public_table_privileges.sql",
    "utf8",
  );
  assert.match(privilegeMigration, /revoke all[\s\S]*?from anon/);
  assert.match(sql, /lap_count integer not null check \(lap_count between 8 and 30\)/);
  assert.doesNotMatch(sql, /service_role|service-role/i);
  const googleMigration = fs.readFileSync(
    "supabase/migrations/20261028220544_google_only_multiplayer_access.sql",
    "utf8",
  );
  assert.match(googleMigration, /create or replace function public\.is_google_user/);
  assert.match(googleMigration, /app_metadata[\s\S]*?providers[\s\S]*?google/);
  assert.match(googleMigration, /google_account_required/);
  assert.match(googleMigration, /using \(public\.is_google_user\(\)/);
  for (const rpc of [
    "create_room", "join_room", "set_room_connection", "room_heartbeat",
    "set_room_ready", "configure_room", "start_room", "begin_room_race",
    "finish_room_race", "return_room_to_lobby", "leave_room",
    "list_public_rooms", "get_room_state", "set_display_name",
  ]) {
    assert.match(
      googleMigration,
      new RegExp(`create or replace function public\\.${rpc}\\([\\s\\S]*?require_google_user`),
    );
  }
});
