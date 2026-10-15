from PIL import Image,ImageDraw,ImageFont
import os,json,subprocess,math
raw=subprocess.check_output(['node','--input-type=module','-e',"import{driverCatalog}from'./src/data/drivers.js';console.log(JSON.stringify(driverCatalog));"])
pilots=json.loads(raw)
skins=['#ba805d','#e3b18c','#7e523e','#a76c4c','#e9c6a5','#8f6958']
for pilot in pilots:
 i=pilot['id'];out='public/assets/drivers/'+pilot['tier'];os.makedirs(out,exist_ok=True)
 im=Image.new('RGBA',(128,144),(13,20,31,255));d=ImageDraw.Draw(im);color=pilot['color'];accent='#d7eaa0' if i==30 else ['#dfecf1','#f3c77b','#a6cfde'][i%3]
 for y in range(144):d.line((0,y,128,y),fill=(15+y//13,22+y//11,34+y//10,255))
 d.polygon([(0,30+i%8),(128,0),(128,45),(0,85)],fill=color+'40')
 # Individual silhouettes: shoulders, suit panels, helmet shape, visor, face and livery.
 width=40+(i%4)*2;d.polygon([(14,144),(21,111),(45,98),(83,98),(108,111),(117,144)],fill=color)
 d.polygon([(14,144),(21,111),(43,104),(48,144)],fill='#1b2634');d.polygon([(82,105),(107,111),(117,144),(80,144)],fill='#1b2634')
 d.rectangle((58,106,68,143),fill=accent);d.rectangle((30,118,45,123),fill=accent);d.rectangle((78,124,102,128),fill=accent)
 d.polygon([(64-width,72),(27,40),(42,23-i%3),(78,20+i%4),(101,40),(64+width,72),(90,101),(38,101)],fill=color)
 d.polygon([(64-width,65),(29,41),(43,25),(62,23),(56,101),(38,101)],fill=accent)
 d.polygon([(31,52),(98,48),(105,66),(97,84),(33,83),(24,69)],fill='#111d2c')
 d.polygon([(33,56),(95,53),(99,63),(31,67)],fill='#6c9ea9')
 d.rectangle((39,64,91,78),fill=skins[i%len(skins)]);d.rectangle((40,66,56,69),fill='#17222b');d.rectangle((72,66,87,69),fill='#17222b');d.rectangle((48,68,52,71),fill='#e9ede8');d.rectangle((76,68,80,71),fill='#e9ede8')
 d.polygon([(32,83),(97,83),(88,100),(42,100)],fill=color);d.rectangle((51,90,78,94),fill='#202b38')
 if i%3==0:d.polygon([(65,22),(80,24),(94,39),(82,42)],fill='#f0e8c8')
 elif i%3==1:d.line((38,36,88,27,100,44),fill=accent,width=4)
 else:d.polygon([(62,23),(75,22),(80,47),(64,49)],fill='#26394e')
 if i==30:
  d.polygon([(22,37),(27,11),(48,23),(64,4),(81,24),(105,11),(107,40)],outline='#d4f990',fill='#323b32');d.rectangle((30,54,99,61),fill='#c8f78c')
 d.text((8,128),str(pilot['number']).zfill(2),fill='#fff4dc',stroke_width=0)
 im.resize((384,432),Image.Resampling.NEAREST).save(out+'/driver-'+str(i).zfill(2)+'.png')
 helmet=im.crop((18,15,110,105));mask=Image.new('L',helmet.size,0);md=ImageDraw.Draw(mask);md.polygon([(12,25),(25,5),(62,4),(84,26),(91,56),(72,87),(20,87),(2,57)],fill=255);helmet.putalpha(mask);helmet.resize((256,256),Image.Resampling.NEAREST).save(out+'/helmet-'+str(i).zfill(2)+'.png')
print('31 retratos individuais + 31 capacetes RGBA')
