from PIL import Image, ImageDraw
import random, os
random.seed(17)
p='public/assets/tracks/textures/'
os.makedirs(p,exist_ok=True)
for name,base,noise in [('asphalt',(61,65,68),14),('asphalt-worn',(80,80,75),18),('grass',(68,83,55),17),('dirt',(110,94,68),16),('concrete',(158,163,160),10)]:
 im=Image.new('RGB',(128,128)); pix=im.load()
 for y in range(128):
  for x in range(128):
   n=random.randint(-noise,noise);pix[x,y]=tuple(max(0,min(255,v+n)) for v in base)
 im.save(p+name+'.png')
im=Image.new('RGB',(64,64),(220,225,218)); d=ImageDraw.Draw(im); d.rectangle((0,0,63,31),fill=(204,26,49)); im.save(p+'kerb-red-white.png')
im=Image.new('RGBA',(64,64));d=ImageDraw.Draw(im);d.rectangle((24,0,39,63),fill=(239,235,216,255));im.save(p+'track-line.png')
im=Image.new('RGBA',(64,64));d=ImageDraw.Draw(im)
for x in [15,45]:
 for y in range(64): d.line((x,y,x+3,y),fill=(10,12,14,int(65*(1-abs(y-32)/32))))
im.save(p+'braking-marks.png')

# v0.7 neutral terrain grain: desert and snow must not inherit green grass.
neutral_rng=random.Random(7017)
im=Image.new('RGB',(128,128));pix=im.load()
for y in range(128):
 for x in range(128):
  v=215+neutral_rng.randint(-12,12);pix[x,y]=(v,v,v)
im.save(p+'terrain-neutral.png')
