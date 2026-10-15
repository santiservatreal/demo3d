"""Generate original linear RGBE studio HDRI (not an external photograph), CC0."""
import math,struct,os
W,H=512,256;out=os.path.join(os.path.dirname(__file__),'../public/assets/luma/studio.hdr')
with open(out,'wb') as f:
 f.write(f'#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y {H} +X {W}\n'.encode())
 for y in range(H):
  for x in range(W):
   lat=math.pi*(y+.5)/H;lon=2*math.pi*x/W
   sky=.28+.7*max(0,math.cos(lat));soft=6*math.exp(-((lon-4.4)/.55)**2-((lat-.65)/.42)**2)
   rgb=[sky*.97+soft,sky*1.02+soft*.94,sky*1.08+soft*.83];v=max(rgb);m,e=math.frexp(v);scale=m*256/v
   f.write(bytes([min(255,int(c*scale)) for c in rgb]+[e+128]))
print(out)
