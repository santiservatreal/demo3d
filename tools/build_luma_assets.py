"""Original Atlas assets; Blender 4.x procedural modeling, metres, GLB export. CC0."""
import bpy, math, os
from mathutils import Vector
OUT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../public/assets/luma'))
os.makedirs(OUT,exist_ok=True)
def clear():
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def mat(name,color,rough=.65,metal=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
 return m
P={}
def setup():
 global P
 P={k:mat(k,*args) for k,args in {
 'ivory':((.83,.85,.80),.57,0),'sage':((.26,.43,.36),.4,0),'petrol':((.10,.26,.29),.35,0),'graphite':((.105,.15,.16),.57,.25),'rubber':((.055,.071,.073),.91,0),'metal':((.48,.55,.54),.32,.85),'glass':((.19,.35,.38),.18,.25),'wood':((.50,.34,.18),.85,0),'carton':((.63,.46,.28),.92,0),'tape':((.82,.70,.47),.7,0),'white':((.95,.96,.86),.5,0),'amber':((.94,.5,.12),.32,0),'red':((.60,.12,.08),.35,0),'yellow':((.85,.65,.24),.55,0),'concrete':((.55,.57,.52),.91,0),'steel':((.49,.58,.56),.55,.6)}.items()}
def box(name,loc,scale,material,bevel=.025,parent=None):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(P[material]);
 if bevel:
  mod=o.modifiers.new('manufactured edges','BEVEL');mod.width=bevel;mod.segments=2
  normal=o.modifiers.new('weighted normals','WEIGHTED_NORMAL')
 if parent:o.parent=parent
 return o
def cylinder(name,loc,r,depth,material,rot=(0,0,0),vertices=24,parent=None):
 bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=depth,location=loc,rotation=rot);o=bpy.context.object;o.name=name;o.data.materials.append(P[material]);m=o.modifiers.new('edge highlights','BEVEL');m.width=.018;m.segments=2;o.modifiers.new('weighted normals','WEIGHTED_NORMAL');
 if parent:o.parent=parent
 return o
def group(name,loc=(0,0,0)):
 o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.location=loc;return o
def export(name):
 bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,name+'.glb'),export_format='GLB',export_yup=True,export_apply=True,export_extras=True,export_cameras=False,export_lights=False)
def label(text,loc,size=.3,color='white',rotation=(math.pi/2,0,math.pi),parent=None):
 bpy.ops.object.text_add(location=loc,rotation=rotation);o=bpy.context.object;o.name='branding-'+text;o.data.body=text;o.data.size=size;o.data.extrude=.001;o.data.materials.append(P[color]);o.data.align_x='CENTER';
 bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH')
 if parent:o.parent=parent
 return o
clear();setup()
# Rigid light truck, 6.5m long; Blender Y points forward, exported Three -Z forward.
box('ladder-chassis',(0,-.3,.66),(1.7,5.5,.2),'graphite',.05)
for x in [-.65,.65]:box('chassis-rail',(x,-.3,.74),(.13,5.4,.22),'graphite')
box('cab-main',(0,1.94,1.45),(2.12,1.85,1.7),'ivory',.17)
box('cab-roof',(0,1.86,2.35),(2.16,1.8,.13),'ivory',.09)
box('windscreen-recess',(0,2.874,1.96),(1.92,.06,.67),'graphite',.08)
box('windscreen',(0,2.914,1.97),(1.79,.035,.55),'glass',.05)
box('windscreen-divider',(0,2.941,1.97),(.032,.02,.55),'metal',.003)
for x in [-1,1]:
 box('side-window',(x*1.069,1.95,1.98),(.035,1.25,.58),'glass',.05)
 box('door-handle',(x*1.1,1.55,1.42),(.04,.24,.045),'graphite',.01)
 box('door-step',(x*1.08,1.8,.67),(.18,.85,.12),'metal',.02)
 box('mirror-arm',(x*1.18,2.5,2.07),(.28,.04,.04),'graphite',.01)
 box('wing-mirror',(x*1.34,2.5,2.07),(.12,.2,.33),'graphite',.04)
 box('mirror-glass',(x*1.34,2.39,2.07),(.08,.015,.26),'metal',.015)
 box('headlight',(x*.8,2.91,1.11),(.4,.06,.2),'white',.035)
 box('indicator',(x*.99,2.91,1.32),(.12,.065,.12),'amber',.02)
 box('mudflap',(x*.92,-1.6,.42),(.3,.08,.55),'rubber',.01)
box('front-bumper',(0,2.96,.84),(2.16,.18,.26),'graphite',.04)
box('grille',(0,2.922,1.27),(1.2,.05,.33),'graphite',.015)
for z in [1.16,1.25,1.34]:box('grille-slat',(0,2.958,z),(1.1,.025,.025),'metal',.002)
box('number-plate',(0,3.06,.85),(.58,.02,.13),'white',.01);label('LW 014',(0,3.075,.81),.085,'graphite')
for x in [-.7,.7]:box('wiper',(x*.5,2.949,1.77),(.47,.02,.025),'graphite',.003)
for axle,y in enumerate([1.73,-1.75]):
 for side,x in [('L',-1.02),('R',1.02)]:
  pivot=group('steer_'+side if axle==0 else 'rear_'+side,(x,y,.49))
  # local wheel centres and axle pivots are kept as nodes for distance-based rotation.
  wheel=group('wheel_'+str(axle)+'_'+side);wheel.parent=pivot
  cylinder('tyre',(0,0,0),.47,.26,'rubber',(0,math.pi/2,0),32,wheel)
  cylinder('alloy',( -.15 if x<0 else .15,0,0),.29,.035,'metal',(0,math.pi/2,0),24,wheel)
  cylinder('hub',( -.18 if x<0 else .18,0,0),.12,.05,'graphite',(0,math.pi/2,0),16,wheel)
  for a in range(6):
   ang=a*math.pi/3;cylinder('wheel-bolt',((-.21 if x<0 else .21),.19*math.cos(ang),.19*math.sin(ang)),.022,.025,'metal',(0,math.pi/2,0),8,wheel)
  box('wheel-fender',(x,y,.98),(.36,1.15,.13),'graphite',.05)
box('box-floor',(0,-1.04,.94),(2.15,3.9,.16),'metal',.025)
box('box-left',(-1.06,-1.04,1.98),(.09,3.95,2),'ivory',.025)
box('box-right',(1.06,-1.04,1.98),(.09,3.95,2),'ivory',.025)
box('box-front',(0,.9,1.98),(2.15,.09,2),'ivory',.02)
box('box-roof',(0,-1.05,3),(2.2,4,.1),'ivory',.04)
for x in [-1.112,1.112]:
 box('brand-belt',(x,-1.05,1.53),(.018,3.92,.38),'sage',.001)
 for y in [-2.9,-1.9,-.9,.1,.9]:box('panel-rib',(x,y,2.1),(.025,.025,1.4),'metal',.002)
 # text outward on both sides, no bitmap brand dependencies.
 label('LUMA',(x,-1.03,2.14),.38,'petrol',(math.pi/2,0,(math.pi/2 if x>0 else -math.pi/2)))
for side in [-1,1]:
 door=group('door_'+('left' if side<0 else 'right'),(side*1.075,-3.05,1.05))
 box('rear-door',(-side*.535,0,.96),(1.04,.09,1.9),'ivory',.025,door)
 for z in [.3,1.6]:box('hinge',(-side*.05,-.07,z),(.12,.04,.18),'metal',.01,door)
 box('door-lock',(-side*.7,-.07,.95),(.035,.035,1.5),'metal',.007,door)
platform=group('lift_platform',(0,-3.1,.92));box('lift-deck',(0,-.59,0),(2.05,1.18,.10),'metal',.025,platform)
for x in [-.82,.82]:
 box('brake-lamp',(x,-3.13,.73),(.28,.05,.12),'red',.02)
box('rear-bumper',(0,-3.16,.48),(2.1,.12,.14),'graphite',.025)
export('truck')
clear();setup()
# Factory shell 18x12m with open front and removable roof. Roof never covers the office.
box('slab',(0,0,.12),(18.8,12.8,.24),'concrete',.05)
box('rear-wall',(0,-6,2.35),(18,.22,4.5),'ivory',.025)
for x in [-9,9]:box('side-wall',(x,0,2.35),(.22,12,4.5),'ivory',.025)
for x in [-9,-3,3,9]:box('portal-column',(x,5.85,2.35),(.22,.28,4.5),'petrol',.025)
box('front-header',(0,5.85,4.22),(18,.3,.7),'petrol',.025)
for x in [-7,-5,-1,1,5,7]:box('clerestory',(x,5.995,4.3),(1.6,.04,.34),'glass',.01)
for x in [-8,-6,-4,-2,0,2,4,6,8]:box('wall-seam',(x,-6.13,2.3),(.025,.015,4.2),'steel',.002)
roof=group('removable_roof')
for i in range(3):
 x=-6+i*6
 a=box('standing-seam-roof',(x,-.05,4.78),(5.9,12.4,.15),'steel',.02,roof);a.rotation_euler[1]=.04
 for j in range(7):box('roof-rib',(x-2.5+j*.8,0,4.92),(.035,12.2,.06),'metal',.006,roof)
 box('skylight-frame',(x,-1,5.05),(2,6,.12),'graphite',.02,roof);box('skylight',(x,-1,5.13),(1.8,5.8,.06),'glass',.01,roof)
for x in [-6,0,6]:
 box('beam',(x,0,4.4),(.12,11.5,.12),'steel',.01)
label('LUMA WORKS',(0,6.035,4.02),.48,'white')
# Attached glazed small office, not separate finance/marketing buildings.
box('office-body',(-6,8,1.65),(6,3.7,3.1),'ivory',.08)
for x in [-8,-6,-4]:
 box('office-frame',(x,9.88,1.7),(1.8,.12,2.5),'graphite',.02)
 box('office-window',(x,9.96,1.7),(1.65,.04,2.35),'glass',.02)
box('office-canopy',(-6,10.1,3.25),(6.5,1.4,.16),'sage',.03)
label('EST. 2026',(-6,10.03,2.8),.22,'white')
export('factory')
clear();setup()
# Warehouse with physical openings, frame, dock bumpers and a shutter pivot per bay.
box('slab',(0,0,.4),(12.7,10.7,.8),'concrete',.06)
box('rear',(0,-5,2.7),(12,.2,4.2),'ivory')
for x in [-6,6]:box('side',(x,0,2.7),(.2,10,4.2),'ivory')
box('upper-front',(0,5,4.25),(12,.22,1.2),'petrol')
for x in [-6,-2,2,6]:box('front-pillar',(x,5,2.3),(.4,.3,3.4),'petrol')
for i,x in enumerate([-4,0,4]):
 box('dock-throat',(x,4.9,.6),(3.3,1,.4),'concrete')
 for side in [-1,1]:
  box('dock-seal',(x+side*1.58,5.16,2.1),(.16,.3,2.9),'rubber',.02)
  box('dock-bumper',(x+side*1.34,5.35,.56),(.3,.18,.7),'rubber',.04)
  cylinder('bollard',(x+side*1.9,5.7,.8),.1,1.3,'yellow')
 box('dock-leveler',(x,5.2,.82),(2.6,1,.09),'metal')
 shutter=group('shutter_'+str(i),(x,5.05,3.7))
 for n in range(15):box('rolling-panel',(0,0,-n*.19),(2.95,.09,.18),'steel',.012,shutter)
 label('0'+str(i+1),(x,5.17,4.15),.3,'white')
roof=group('removable_roof');box('roof',(0,0,4.9),(12.6,10.5,.22),'steel',.04,roof)
for x in [-4,0,4]:
 box('roof-vent',(x,-2,5.15),(1.1,1.3,.35),'metal',.04,roof)
 for n in range(5):box('vent-louver',(x,-2.5+n*.2,5.34),(.9,.04,.02),'graphite',.003,roof)
export('warehouse')
clear();setup()
# Forklift with movable mast carriage. Attachment inherits all fork transforms.
box('body',(0,0,.7),(1.1,1.6,.65),'yellow',.13)
box('counterweight',(0,-.75,.8),(1.13,.5,.8),'petrol',.14)
box('seat',(0,-.2,1.13),(.6,.55,.17),'rubber',.08);box('seat-back',(0,-.46,1.42),(.6,.13,.55),'rubber',.06)
for x in [-.5,.5]:
 box('protection-post',(x,-.5,1.65),(.055,.07,1.65),'graphite',.01)
 box('front-post',(x,.6,1.65),(.055,.07,1.65),'graphite',.01)
 for y in [-.45,.6]:cylinder('wheel',(x,y,.36),.31,.19,'rubber',(0,math.pi/2,0),20)
box('overhead-guard',(0,.05,2.45),(1.18,1.65,.1),'petrol',.025)
for x in [-.32,.32]:box('mast',(x,.88,1.5),(.11,.14,2.8),'graphite',.015)
forks=group('fork_carriage',(0,1.02,.22))
box('fork-back',(0,0,.4),(.9,.12,.8),'metal',.01,forks)
for x in [-.35,.35]:box('fork',(x,.65,0),(.12,1.45,.07),'metal',.015,forks)
box('hydraulic-ram',(0,.92,1.22),(.08,.08,1.9),'metal',.012)
export('forklift')
clear();setup()
# Reusable europallet with nine blocks and actual fork clearances.
for x in [-.48,0,.48]:
 for y in [-.36,0,.36]:box('pallet-block',(x,y,.08),(.18,.16,.12),'wood',.009)
for x in [-.48,0,.48]:box('bottom-board',(x,0,.02),(.18,.8,.04),'wood',.007)
for y in [-.34,-.17,0,.17,.34]:box('top-board',(0,y,.17),(1.2,.13,.045),'wood',.006)
export('pallet')
clear();setup()
box('cardboard',(0,0,.23),(.55,.37,.46),'carton',.014)
for z in [.465,.01]:box('flap-seam',(0,0,z),(.014,.37,.008),'tape',.001)
box('label',(.13,-.19,.27),(.18,.008,.14),'white',.003)
for x in [.07,.10,.12,.15,.18]:box('barcode',(x,-.195,.27),(.009,.004,.09),'graphite',.001)
export('carton')
clear();setup()
# The same finished product is used at assembly, QC and packing stations.
cylinder('lamp-base',(0,0,.025),.16,.05,'petrol',vertices=32)
cylinder('lamp-arm',(0,0,.26),.019,.46,'metal')
arm=box('lamp-upper',(0,.12,.49),(.03,.28,.035),'petrol',.012);arm.rotation_euler[0]=-.2
bpy.ops.mesh.primitive_cone_add(vertices=32,radius1=.16,radius2=.065,depth=.14,location=(0,.24,.47));o=bpy.context.object;o.name='lamp-shade';o.data.materials.append(P['sage'])
cylinder('LED-diffuser',(0,.24,.395),.14,.012,'white',vertices=32)
export('lamp')
print('Assets built:',OUT)
