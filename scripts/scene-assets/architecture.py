"""Reference-directed coast architecture, metres/Z-up/front=-Y.

Geometry remains editable; common pipeline owns UVs, baking and glTF export.
"""
import math
import random
import bpy
import bmesh
from common import material, box, mesh, beam
from mathutils import Vector


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

    def timber(self, name, a, b, width=.15, depth=.15, mat='wood'):
        a,b=Vector(a),Vector(b)
        ob=self.box(name,(a+b)*.5,(width,depth,(b-a).length),mat,.012)
        ob.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler()
        ob['jointStart']=list(a); ob['jointEnd']=list(b)
        return ob

    def pipe(self, name, a, b, radius=.055):
        a,b=Vector(a),Vector(b)
        bpy.ops.mesh.primitive_cylinder_add(vertices=8,radius=radius,depth=(b-a).length,location=(a+b)*.5)
        ob=bpy.context.object; ob.name=self.name+'-'+name
        ob.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler()
        ob.data.materials.append(self.m['iron'])
        ob['jointStart']=list(a); ob['jointEnd']=list(b)
        return self.add(ob)

    def lean_roof(self,name,x0,x1,y0,y1,z0,z1):
        """A single roof plane, continuously seated at its wall and outer header."""
        def z(y): return z0+(z1-z0)*(y-y0)/(y1-y0)
        def slab(label,xa,xb,ya,yb,lift,mat):
            verts=[(x,y,z(y)+h) for h in (lift-.12,lift) for x,y in ((xa,ya),(xb,ya),(xb,yb),(xa,yb))]
            self.mesh(label,verts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],mat)
        slab(name+'-deck',x0,x1,y0,y1,0,'roofdark')
        cols=max(3,round((x1-x0)/.5)); rows=max(3,round(abs(y1-y0)/.38))
        for j in range(rows):
            ya=y0+(y1-y0)*j/rows; yb=y0+(y1-y0)*(j+1)/rows
            for i in range(cols):
                xa=x0+(x1-x0)*i/cols; xb=x0+(x1-x0)*(i+1)/cols-.012
                slab(name+'-slate',xa,xb,ya,yb,.055,self.rng.choice(['slate','slate','slate2']))
        for x in (x0,x1): self.timber(name+'-fascia',(x,y0,z0-.065),(x,y1,z1-.065),.13,.16,'roofdark')
        self.box(name+'-outer-fascia',((x0+x1)/2,y1,z1-.07),(x1-x0,.12,.18),'roofdark',.01)
        self.box(name+'-wall-flashing',((x0+x1)/2,y0,z0+.10),(x1-x0,.10,.28),'iron',.01)
        self.pipe(name+'-gutter',(x0,y1,z1-.08),(x1,y1,z1-.08),.075)

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
                self.timber(name+'-barge',(cx,y,peak-.035),(cx+side*half,y,eave-.035),.16,.18,'roofdark')
            self.box(name+'-fascia',(cx+side*half,cy,eave-.08),(.15,depth,.22),'roofdark',.012)
            self.pipe(name+'-gutter',(cx+side*(half+.07),cy-depth/2,eave-.02),(cx+side*(half+.07),cy+depth/2,eave-.02),.08)
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
    # Preserve the wall's slope through the overhang: underside meets the gable
    # and side-wall top exactly instead of leaving a widening daylight gap.
    roofeave=eave+.13-(peak-eave)*.66/w
    b.roof('main-roof',w+.66,d+.76,roofeave,peak+.13)
    for sx in (-1,1):
        gx=sx*(w/2+.40); gy=d/2+.38
        elbow=(sx*(w/2+.13),d/2+.10,roofeave-.34)
        b.pipe('main-drain-elbow',(gx,gy,roofeave-.02),elbow)
        b.pipe('main-downpipe',elbow,(elbow[0],elbow[1],.28))
        b.pipe('main-drain-shoe',(elbow[0],elbow[1],.28),(elbow[0],elbow[1]+.20,.12))
        for z in (.65,roofeave-.65): b.box('downpipe-strap',(elbow[0],elbow[1],z),(.16,.16,.055),'iron',.008)
    b.stone_details(w,d,eave)
    doorx=(holes[0][0]+holes[0][1])/2
    # Adjacent solid blocks have distinct footprints; every exposed rise is .12m.
    # Landing meets the door opening floor at .36m; no layered intersecting treads.
    b.box('porch-landing',(doorx,front-.54,.18),(2.10,1.08,.36),'foundation',0)
    b.box('porch-middle-step',(doorx,front-1.24,.12),(2.10,.32,.24),'foundation',0)
    b.box('porch-bottom-step',(doorx,front-1.56,.06),(2.10,.32,.12),'foundation',0)
    sill=next(ob for ob in b.objects if ob.name==name+'-front-opening-0-sill')
    sill.location.z=.275; sill['walkingTop']=.36
    # A low plinth course terminates on each side of the doorway.
    for xa,xb in ((-w/2,holes[0][0]-.19),(holes[0][1]+.19,w/2)):
        b.box('front-plinth',((xa+xb)/2,front-.045,.23),(xb-xa,.15,.22),'foundation',.018)
    if variant!='gable':
        # Wall ledger, outer header and rafter ends form an explicit load path.
        outer=front-.94; top=3.075; walltop=3.345
        b.box('porch-wall-ledger',(doorx,front-.05,3.15),(2.08,.19,.18),'wood',.014)
        b.box('porch-header',(doorx,outer,2.71),(2.12,.22,.32),'wood',.014)
        for xx in (doorx-.85,doorx+.85):
            b.box('porch-stone-shoe',(xx,outer,.53),(.30,.30,.34),'trim',.025)
            b.box('porch-post',(xx,outer,1.625),(.20,.20,1.85),'wood',.014)
            inside=xx+(.38 if xx<doorx else -.38)
            b.timber('porch-knee',(xx,outer,2.14),(inside,outer,2.58),.12,.14)
        for xx in (doorx-.86,doorx,doorx+.86):
            b.timber('porch-rafter',(xx,outer,top-.203),(xx,front-.05,walltop-.203),.12,.16)
        b.lean_roof('porch-roof',doorx-1.12,doorx+1.12,front-.04,front-1.10,walltop,top-.045)
        drainx=doorx-1.12; drainy=front-1.10; drainz=top-.125
        b.pipe('porch-downpipe',(drainx,drainy,drainz),(drainx,drainy,.22),.042)
        b.pipe('porch-drain-shoe',(drainx,drainy,.22),(drainx,drainy-.15,.12),.042)
    chimneyx=w*.26; chimneyy=d*.16
    roofz=peak-(peak-eave)*abs(chimneyx)/(w/2)
    b.box('chimney-stack',(chimneyx,chimneyy,roofz+.56),(.66,.71,1.57),'stone',.06)
    b.box('chimney-cap',(chimneyx,chimneyy,roofz+1.34),(.88,.9,.19),'trim',.045)
    b.box('chimney-flue',(chimneyx,chimneyy,roofz+1.445),(.48,.48,.028),'shadow',0)
    # The apron follows the roof plane and meets the chimney on all four sides.
    slope=(peak-eave)/(w/2)
    def flashz(x): return peak+.21-slope*x
    for label,xa,xb,ya,yb in (
        ('left',chimneyx-.43,chimneyx-.30,chimneyy-.46,chimneyy+.46),
        ('right',chimneyx+.30,chimneyx+.43,chimneyy-.46,chimneyy+.46),
        ('front',chimneyx-.43,chimneyx+.43,chimneyy-.46,chimneyy-.31),
        ('back',chimneyx-.43,chimneyx+.43,chimneyy+.31,chimneyy+.46)):
        verts=[(x,y,flashz(x)+dz) for dz in (0,.035) for x,y in ((xa,ya),(xb,ya),(xb,yb),(xa,yb))]
        b.mesh('chimney-flashing-'+label,verts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],'iron')
    if variant=='low':
        # A rear lean-to attaches below the eave, retaining the main roof intact.
        # Its wall tops follow the same roof underside plane with no pasted gable.
        xa,xb=-2.85,-.65; ya,yb=d/2,d/2+1.02
        z0,z1=2.96,2.53
        b.box('wing-foundation',((xa+xb)/2,(ya+yb)/2,.15),(xb-xa,yb-ya,.30),'foundation',.025)
        b.box('wing-rear-wall',((xa+xb)/2,yb-.12,(z1-.12+.12)/2),(xb-xa,.24,z1-.24),'stone',0)
        for x in (xa,xb-.24):
            verts=[(xx,y,z) for xx in (x,x+.24) for y,z in ((ya,.12),(yb,.12),(yb,z1-.12),(ya,z0-.12))]
            b.mesh('wing-side-wall',verts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
        # Roof projects beyond the outer wall using the exact continuation slope.
        b.lean_roof('wing-roof',xa-.14,xb+.14,ya-.035,yb+.18,z0+.015,z1-.076)
        b.pipe('wing-downpipe',(xa-.14,yb+.18,z1-.156),(xa-.14,yb+.18,.18))
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
