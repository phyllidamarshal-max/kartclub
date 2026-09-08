"""Reference-directed coast architecture, metres/Z-up/front=-Y.

Geometry remains editable; common pipeline owns UVs, baking and glTF export.
"""
import math
import random
import bpy
import bmesh
from common import material, box, mesh, beam


def _surface(name, color, kind='stone'):
    mat = material(name, color, 0.84 if kind == 'stone' else 0.72)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    shader = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    coord = nodes.new('ShaderNodeTexCoord')
    mapping = nodes.new('ShaderNodeVectorMath'); mapping.operation = 'MULTIPLY'
    mapping.inputs[1].default_value = (3, 3, 3) if kind == 'stone' else (18, 18, 1.5)
    links.new(coord.outputs['Generated'], mapping.inputs[0])
    noise = nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 5
    noise.inputs['Detail'].default_value = 3; noise.inputs['Roughness'].default_value = .72
    links.new(mapping.outputs['Vector'], noise.inputs['Vector'])
    ramp = nodes.new('ShaderNodeValToRGB')
    rgb = tuple(color[:3])
    ramp.color_ramp.elements[0].position = .17
    ramp.color_ramp.elements[0].color = (*(c * .78 for c in rgb), 1)
    ramp.color_ramp.elements[1].position = .85
    ramp.color_ramp.elements[1].color = (*(min(1, c * 1.10) for c in rgb), 1)
    links.new(noise.outputs['Fac'], ramp.inputs[0]); links.new(ramp.outputs['Color'], shader.inputs['Base Color'])
    bump = nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = .18
    bump.inputs['Distance'].default_value = .025 if kind == 'stone' else .012
    links.new(noise.outputs['Fac'], bump.inputs['Height']); links.new(bump.outputs['Normal'], shader.inputs['Normal'])
    return mat


class Builder:
    def __init__(self, name, mats, seed):
        self.name, self.m, self.rng, self.objects = name, mats, random.Random(seed), []

    def add(self, ob):
        self.objects.append(ob); return ob

    def box(self, name, loc, dims, mat='stone', bevel=.025):
        # One-segment bevels give readable softened highlights without spending
        # the cottage budget on small dressed-stone and timber pieces.
        ob = box(self.name+'-'+name, loc, dims, self.m[mat], 0)
        if bevel:
            mod=ob.modifiers.new('Dressed edge', 'BEVEL')
            mod.width=min(bevel,min(dims)*.22); mod.segments=1
            bpy.context.view_layer.objects.active=ob
            bpy.ops.object.modifier_apply(modifier=mod.name)
        return self.add(ob)

    def mesh(self, name, vertices, faces, mat='stone'):
        return self.add(mesh(self.name+'-'+name, vertices, faces, self.m[mat]))

    def beam(self, name, a, b, radius, mat='wood', vertices=6):
        return self.add(beam(self.name+'-'+name, a, b, radius, self.m[mat], vertices))

    def wall(self, name, width, eave, peak, y, holes, offset=0, rotate=False):
        """Continuous double-faced wall with boundary reveals, never a solid box behind windows.

        Grid cells clip against the gable polygon. Only exterior and opening
        boundaries receive thickness faces; no false seams between wall cells.
        """
        half = width/2; thick = .24
        xs = sorted(set([-half, half]+[v for h in holes for v in h[:2]]))
        zs = sorted(set([.12, eave, peak]+[v for h in holes for v in h[2:]]))
        vertices, faces = [], []
        def transform(x, depth, z):
            return (depth, x+offset, z) if rotate else (x+offset, depth, z)
        def clip(poly, side):
            # x <= half*(peak-z)/(peak-eave), mirrored for the left slope.
            if peak <= eave: return poly
            def dist(p): return half*(peak-p[1])/(peak-eave)-side*p[0]
            out=[]
            for a,b in zip(poly,poly[1:]+poly[:1]):
                da,db=dist(a),dist(b)
                if da>=-1e-7: out.append(a)
                if (da>=0)!=(db>=0):
                    t=da/(da-db); out.append((a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])))
            return out
        edges={}
        for xa,xb in zip(xs,xs[1:]):
            for za,zb in zip(zs,zs[1:]):
                if any(h[0] <= (xa+xb)/2 <= h[1] and h[2] <= (za+zb)/2 <= h[3] for h in holes): continue
                poly=[(xa,za),(xb,za),(xb,zb),(xa,zb)]
                if za>=eave: poly=clip(clip(poly,1),-1)
                # Clipping at ridge may yield duplicate vertices.
                poly=list(dict.fromkeys((round(x,6),round(z,6)) for x,z in poly))
                if len(poly)<3: continue
                start=len(vertices); n=len(poly)
                vertices += [transform(x,y+d,z) for d in (0,thick) for x,z in poly]
                faces.extend([tuple(start+i for i in range(n)),tuple(start+n+i for i in reversed(range(n)))])
                for a,b in zip(poly,poly[1:]+poly[:1]):
                    k=tuple(sorted((a,b))); edges[k]=edges.get(k,0)+1
        for (a,b),count in edges.items():
            if count!=1: continue
            start=len(vertices)
            vertices += [transform(a[0],y,a[1]),transform(b[0],y,b[1]),transform(b[0],y+thick,b[1]),transform(a[0],y+thick,a[1])]
            faces.append(tuple(range(start,start+4)))
        return self.mesh(name,vertices,faces)

    def window(self, name, x,y,z,w=1.05,h=1.4, door=False):
        # Wall front at y, glazing and timber sit 15cm inside the opening.
        self.box(name+'-recess',(x,y+.205,z),(w,.035,h),'shadow',0)
        self.box(name+'-infill',(x,y+.155,z),(w-.12,.06,h-.12),'wood' if door else 'glass',.012)
        for sx in (-1,1):
            self.box(name+'-jamb',(x+sx*(w/2+.055),y-.045,z),(.17,.22,h+.16),'trim',.025)
            self.box(name+'-timber-side',(x+sx*(w/2-.07),y+.07,z),(.09,.13,h),'wood',.014)
        for sz in (-1,1):
            self.box(name+'-frame',(x,y+.07,z+sz*(h/2-.04)),(w,.13,.09),'wood',.012)
        self.box(name+'-lintel',(x,y-.08,z+h/2+.13),(w+.42,.35,.23),'trim',.035)
        self.box(name+'-sill',(x,y-.12,z-h/2-.08),(w+.38,.44,.17),'trim',.035)
        if door:
            for j in range(1,5):
                self.box(name+'-plank-seam',(x-w/2+j*w/5,y+.116,z),(.014,.012,h-.2),'shadow',0)
            for dz in (-.65,.36):
                self.box(name+'-rail',(x,y+.10,z+dz),(w-.20,.07,.09),'wood',.01)
            self.box(name+'-latch',(x+w*.29,y+.025,z-.1),(.065,.08,.18),'iron',.02)
        else:
            self.box(name+'-mullion',(x,y+.055,z),(.075,.15,h),'wood',.01)
            self.box(name+'-transom',(x,y+.055,z+.04),(w,.15,.075),'wood',.01)

    def roof(self, name, width, depth, eave, peak, cx=0,cy=0):
        half=width/2; slope=(peak-eave)/half
        for side in (-1,1):
            def pt(u,v,lift): return (cx+side*u,cy+v,peak-slope*u+lift)
            def tile(label,ua,ub,va,vb,lift,mat):
                verts=[pt(u,v,z) for z in (lift-.13,lift) for u,v in ((ua,va),(ub,va),(ub,vb),(ua,vb))]
                self.mesh(label,verts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],mat)
            tile(name+'-solid-eave',0,half,-depth/2,depth/2,0,'roofdark')
            rows=max(4,round(half/.46)); columns=max(5,round(depth/.64))
            for row in range(rows):
                ua=row*half/rows; ub=min(half,ua+half/rows+.07)
                stagger=.5 if row%2 else 0
                for col in range(-1,columns):
                    va=max(-depth/2,-depth/2+(col+stagger)*depth/columns)
                    vb=min(depth/2,-depth/2+(col+1+stagger)*depth/columns-.012)
                    if vb-va<.05: continue
                    tile(name+'-slate',ua,ub,va,vb,.065+self.rng.uniform(-.012,.012),self.rng.choice(['slate','slate','slate2','slate3']))
            for y in (-depth/2-.015,depth/2+.015):
                self.beam(name+'-barge',(cx,y,peak+.07),(cx+side*(half+.04),y,eave+.02),.105,'roofdark',4)
        for j in range(max(1,round(depth/.58))):
            count=round(depth/.58); y=-depth/2+(j+.5)*depth/count
            self.box(name+'-ridge',(cx,y,peak+.11),(.25,depth/count-.01,.20),'slate2',.04)

    def stone_details(self,w,d,eave,cx=0,cy=0):
        for x in (-w/2,w/2):
            for row in range(int(eave/.49)):
                z=.37+row*.49
                self.box('corner-quoin',(cx+x,cy-d/2-.025,z),(.42 if row%2 else .64,.13,.31),'trim',.032)
                self.box('return-quoin',(cx+x+(.035 if x>0 else -.035),cy-d/2+.30,z),(.13,.55 if row%2 else .34,.31),'trim',.026)
        # Sparse irregularly placed stones, not a uniform brick grid.
        for side in (-1,1):
            for row in range(int(eave/.62)):
                for col in range(4):
                    yy=cy-d/2+.70+col*(d-1.2)/4+self.rng.uniform(-.18,.18)
                    zz=.40+row*.62+self.rng.uniform(-.1,.1)
                    if abs(yy)<.86 and .82<zz<2.79: continue
                    if self.rng.random()<.56:
                        self.box('relief-stone',(cx+side*(w/2+.027),yy,zz),(.075,self.rng.uniform(.3,.66),self.rng.uniform(.17,.27)),self.rng.choice(['trim','stone2']),.025)


def _cottage(name,m,w,d,eave,peak,seed,variant):
    b=Builder(name,m,seed); front=-d/2
    b.box('foundation',(0,0,.15),(w+.18,d+.18,.30),'foundation',.065)
    if variant=='low':
        holes=[(-2.0,-.90,.36,2.66),(.55,1.75,1.02,2.45)]
    else:
        holes=[(-2.10,-.90,.36,2.80),(.60,1.75,1.04,2.62),(-.58,.58,4.05,5.58)]
        if variant=='gable': holes=[(-.65,.65,.36,2.75),(-.56,.56,3.72,5.13)]
    b.wall('front-pierced-wall',w,eave,peak,front,holes)
    b.wall('back-pierced-wall',w,eave,peak,d/2-.24,[(-.5,.5,1.1,2.5)])
    for sx in (-1,1):
        # Keep side glazing holes clear of the relief stones by using upper strip.
        sideholes=[(-.6,.6,1.1,2.5)]
        # Butt the side walls into the 24cm front/back walls. Extending them
        # through the corners creates coplanar exterior faces; bump shading on
        # those overlaps produced continuous black shadow strips in Cycles.
        b.wall('side-pierced-wall',d-.48,eave,eave,sx*w/2-(.24 if sx>0 else 0),sideholes,rotate=True)
        for lo,hi,zlo,zhi in sideholes:
            previous=len(b.objects)
            b.window('side-window',0,front,1.8,1.2,1.4)
            # Transform front-oriented detail to side orientation about origin.
            theta=sx*math.pi/2
            for ob in b.objects[previous:]:
                x,y,z=ob.location; ob.location=(sx*(w/2+(y-front)*-1),x,z)
                ob.rotation_euler[2]=theta
    for j,(lo,hi,zlo,zhi) in enumerate(holes):
        b.window('front-opening-'+str(j),(lo+hi)/2,front,(zlo+zhi)/2,hi-lo,zhi-zlo,door=j==0)
    previous=len(b.objects)
    b.window('rear-window',0,front,1.8,1,1.4)
    for ob in b.objects[previous:]:
        ob.location.y=-ob.location.y; ob.rotation_euler[2]=math.pi
    b.roof('main-roof',w+.66,d+.76,eave-.07,peak+.15)
    b.stone_details(w,d,eave)
    doorx=(holes[0][0]+holes[0][1])/2
    for j in range(3):
        b.box('door-step',(doorx,front-.36-j*.26,.30-j*.08),(1.65,.80+j*.30,.16),'foundation',.04)
    if variant!='gable':
        # Compact lean-to entrance shelter, timber posts and diagonal brackets.
        for xx in (doorx-.85,doorx+.85):
            b.box('porch-post',(xx,front-.97,1.50),(.12,.13,2.62),'wood',.02)
            b.beam('porch-knee',(xx,front-.98,2.18),(xx,front-.40,2.76),.06)
        b.roof('porch-roof',2.20,1.6,2.83,3.28,doorx,front-.64)
    chimneyx=w*.26; chimneyy=d*.16
    roofz=peak-(peak-eave)*abs(chimneyx)/(w/2)
    b.box('chimney-stack',(chimneyx,chimneyy,roofz+.56),(.66,.71,1.57),'stone',.06)
    b.box('chimney-cap',(chimneyx,chimneyy,roofz+1.34),(.88,.9,.19),'trim',.045)
    b.box('chimney-flue',(chimneyx,chimneyy,roofz+1.445),(.48,.48,.028),'shadow',0)
    if variant=='low':
        # Off-centre taller gable over the left wing creates the asymmetric silhouette.
        b.box('wing-plaster',(-1.60,.5,2.50),(2.35,3.15,1.2),'stone',.035)
        b.roof('raised-wing',2.85,3.7,3.1,4.57,-1.6,.5)
    return b.objects


def _lighthouse(m):
    b=Builder('lighthouse',m,94)
    def lathe(name, rings, mat, n=24, closed_profile=False):
        vertices=[(r*math.cos(2*math.pi*j/n),r*math.sin(2*math.pi*j/n),z) for z,r in rings for j in range(n)]
        faces=[] if closed_profile else [tuple(reversed(range(n))),tuple((len(rings)-1)*n+j for j in range(n))]
        for k in range(len(rings) if closed_profile else len(rings)-1):
            kk=(k+1)%len(rings)
            for j in range(n): faces.append((k*n+j,k*n+(j+1)%n,kk*n+(j+1)%n,kk*n+j))
        return b.mesh(name,vertices,faces,mat)
    lathe('stepped-footing',[(0,2.02),(.20,2.02),(.25,1.85),(.48,1.85),(.54,1.63)],'foundation')
    lathe('battered-stone-shaft',[(.5,1.56),(2.2,1.48),(6,1.25),(10,1.02),(12.25,.95)],'stone',24)
    lathe('base-band',[(.55,1.58),(.76,1.58),(1.6,1.52),(1.71,1.49)],'lighthousered')
    for z in (2.35,5.5,8.7,11.8):
        radius=1.56-(z-.5)*.052
        lathe('stone-course',[(z,radius+.035),(z+.10,radius+.026)],'trim')
    for z in (4.2,7.55,10.7):
        radius=1.56-(z-.5)*.052
        b.box('shaft-window-shadow',(.05,-radius-.009,z),(.40,.06,.86),'shadow',.045)
        b.box('shaft-window-pane',(.05,-radius-.044,z),(.23,.025,.63),'glass',.015)
        b.box('shaft-window-sill',(.05,-radius-.09,z-.44),(.50,.21,.12),'trim',.025)
    b.box('entry-recess',(0,-1.505,1.32),(.93,.13,1.51),'shadow',.06)
    b.box('entry-door',(0,-1.585,1.28),(.69,.07,1.39),'wood',.04)
    b.box('entry-lintel',(0,-1.59,2.13),(1.12,.22,.23),'trim',.04)
    b.box('entry-step',(0,-1.84,.35),(1.4,.85,.24),'foundation',.045)
    lathe('gallery-support',[(11.95,.96),(12.2,1.24),(12.42,1.6),(12.63,1.65)],'iron')
    lathe('gallery-deck',[(12.61,1.78),(12.78,1.78)],'iron')
    for z in (12.96,13.68): lathe('gallery-rail',[(z,1.71),(z+.065,1.71),(z+.065,1.64),(z,1.64)],'iron',closed_profile=True)
    for j in range(16):
        a=j*math.tau/16; x,y=1.68*math.cos(a),1.68*math.sin(a)
        b.beam('gallery-baluster',(x,y,12.78),(x,y,13.73),.035,'iron',5)
    lathe('lantern-foot',[(12.79,1.03),(13.09,1.03)],'iron',12)
    lathe('lantern-glazing',[(13.08,.94),(14.66,.94)],'glass',12)
    for j in range(12):
        a=j*math.tau/12; x,y=.975*math.cos(a),.975*math.sin(a)
        b.beam('lantern-mullion',(x,y,13.04),(x,y,14.72),.042,'iron',5)
    lathe('lantern-header',[(14.60,1.06),(14.81,1.06)],'iron',12)
    lathe('red-lantern-cap',[(14.8,1.26),(14.98,1.22),(15.94,.12)],'lighthousered',12)
    lathe('cap-finial',[(15.89,.14),(16.08,.14),(16.18,.065),(16.84,.025)],'iron',8)
    return b.objects


def build_assets() -> dict[str, list[bpy.types.Object]]:
    mats={
        'stone':_surface('coast-warm-limestone',(.70,.59,.43,1)),
        'stone2':_surface('coast-muted-inset-stone',(.59,.49,.35,1)),
        'trim':_surface('coast-dressed-sandstone',(.49,.38,.25,1)),
        'foundation':_surface('coast-aged-foundation',(.40,.38,.31,1)),
        'wood':_surface('coast-oiled-oak',(.23,.135,.068,1),'wood'),
        'slate':_surface('coast-blue-slate',(.105,.205,.24,1)),
        'slate2':_surface('coast-light-slate',(.14,.25,.285,1)),
        'slate3':_surface('coast-weathered-slate',(.12,.225,.255,1)),
        'roofdark':material('coast-slate-edges',(.073,.135,.15,1),.86),
        'shadow':material('coast-opening-depth',(.045,.049,.042,1),.96),
        'glass':material('coast-dark-sea-glazing',(.055,.16,.185,1),.25),
        'iron':material('coast-gallery-iron',(.052,.068,.064,1),.56),
        'lighthousered':_surface('coast-oxide-cap',(.42,.145,.085,1)),
    }
    assets = {
        'cottage-hero':_cottage('cottage-hero',mats,6.2,5.9,5.45,8.0,51,'hero'),
        'cottage-gable':_cottage('cottage-gable',mats,4.85,6.6,4.88,7.18,63,'gable'),
        'cottage-low':_cottage('cottage-low',mats,7.35,5.1,3.15,4.43,79,'low'),
        'lighthouse':_lighthouse(mats),
    }
    for objects in assets.values():
        for ob in objects:
            bm=bmesh.new(); bm.from_mesh(ob.data)
            bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)
            bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
            bm.to_mesh(ob.data); bm.free(); ob.data.update()
    return assets
