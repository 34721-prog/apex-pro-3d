import { validateSave } from "../save.js";

export const MAX_CLOUD_SAVE_BYTES = 8 * 1024 * 1024;

/**
 * Cloud data is authoritative whenever an account already has a save. The
 * current browser's validated save is used only to seed a new account.
 */
export function resolveAccountSave(cloudRecord, localSave) {
  if (cloudRecord == null) {
    return {
      source: "local",
      revision: 0,
      save: validateCloudSave(localSave),
    };
  }

  const cloudSave = cloudRecord.save_data;
  const revision = Number(cloudRecord.revision);
  if (
    !cloudSave ||
    typeof cloudSave !== "object" ||
    cloudSave.version !== 1 ||
    !Number.isSafeInteger(revision) ||
    revision < 1
  ) {
    throw new Error("cloud_save_invalid");
  }

  return {
    source: "cloud",
    revision,
    save: validateCloudSave(cloudSave),
  };
}

export function validateCloudSave(value) {
  const save = validateSave(value);
  const bytes = new TextEncoder().encode(JSON.stringify(save)).byteLength;
  if (bytes > MAX_CLOUD_SAVE_BYTES) throw new RangeError("save_too_large");
  return save;
}
