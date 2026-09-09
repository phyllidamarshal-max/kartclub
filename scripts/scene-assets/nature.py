"""Authored reference-coast nature; deterministic metres/Z-up mesh assets.

Canopy shapes are individually proportioned 80-plane lobes. Material variation
is driven by face orientation and height, so facets describe volume coherently.
"""
import math
import bpy
import bmesh
from mathutils import Vector, Matrix
from common import material, mesh, beam


def _palette(prefix, colors):
    return [material(prefix + '-' + str(i), c, .9) for i, c in enumerate(colors)]


def _lobe(name, center, scale, phase, palette, authored_crown=False):
    data = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1)
    rotation = Matrix.Rotation(phase, 3, 'Z') @ Matrix.Rotation((.38 if authored_crown else .18) * math.sin(phase), 3, 'X')
    for v in bm.verts:
        p = rotation @ v.co
        # Smooth, low-frequency irregularity avoids a repeated crystal outline.
        bulge = 1 + (.16 if authored_crown else .085) * math.sin(3 * math.atan2(p.y, p.x) + phase) * (1-p.z*p.z)
        if authored_crown:
            # Lean and unequal shoulders make the large planes read as foliage,
            # while retaining a closed convex-ish volume in every camera view.
            p.x += .11*p.z + .045*math.sin(p.y*4+phase)
            p.y += .065*p.z*p.x
        v.co = Vector((center[0] + scale[0]*(p.x*bulge+.055*p.z*p.z),
                       center[1] + scale[1]*(p.y*bulge+.06*p.x*p.z),
                       center[2] + scale[2]*(p.z+.04*math.sin(p.x*3+phase))))
    bm.to_mesh(data)
    bm.free()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    for mat in palette:
        data.materials.append(mat)
    data.update()
    for face in data.polygons:
        # Warm planes are scarce and confined to upper foliage. Real lighting
        # supplies primary shading; this only adds leaf-tone variation.
        height = (face.center.z-center[2])/scale[2]
        facing = face.normal.dot(Vector((-.45, -.3, .84)))
        face.material_index = 3 if height > .48 and facing > .52 else (2 if height > .05 else (0 if height < -.40 else 1))
    return obj


def _wood_path(name, points, radii, mats):
    """One continuous, tapered polygon trunk rather than stacked cylinders."""
    verts, faces = [], []
    sides = 7
    for i, (point, radius) in enumerate(zip(points, radii)):
        for j in range(sides):
            angle = j*math.tau/sides + .12 + .025*i
            flare = 1 + .09*math.sin(j*2.1+i*.7)
            verts.append((point[0]+math.cos(angle)*radius*flare,
                          point[1]+math.sin(angle)*radius*flare*.88, point[2]))
    faces.append(tuple(reversed(range(sides))))
    for i in range(len(points)-1):
        for j in range(sides):
            faces.append((i*sides+j, i*sides+(j+1)%sides,
                          (i+1)*sides+(j+1)%sides, (i+1)*sides+j))
    faces.append(tuple((len(points)-1)*sides+j for j in range(sides)))
    obj = mesh(name, verts, faces, mats[0])
    for mat in mats[1:]:
        obj.data.materials.append(mat)
    for face in obj.data.polygons:
        face.material_index = 1 if face.normal.x < -.35 else (2 if face.normal.y > .5 else 0)
    return obj


def _tree(name, lobes, trunk, leaf, bark, branches=None, slender=False):
    radii = [.30,.23,.17,.09] if slender else [.47,.35,.27,.12]
    objects = [_wood_path(name+'-trunk', trunk, radii, bark)]
    # Root flares are low wedges whose outer tips are exactly on ground.
    for i, angle in enumerate((.35, 1.85, 3.28, 4.78, 5.6)):
        c, s = math.cos(angle), math.sin(angle)
        vertices = [(0,0,.64), (-s*.26,c*.26,.025), (s*.26,-c*.26,.025),
                    (c*.72-s*.075,s*.72+c*.075,0), (c*.72+s*.075,s*.72-c*.075,0)]
        objects.append(mesh(name+'-root-'+str(i), vertices,
                            [(0,1,3),(0,3,4),(0,4,2),(1,2,4,3),(0,2,1)], bark[i%2]))
    for i, (center, size, phase, split) in enumerate(lobes):
        start = trunk[split]
        elbow = (start[0]*.35+center[0]*.65, start[1]*.35+center[1]*.65,
                 start[2]+(center[2]-start[2])*.52)
        target = (center[0],center[1],center[2]+.12)
        path = branches[i] if branches else [start,elbow,target]
        objects.append(_wood_path(name+'-branch-'+str(i), path,
                                  [.16,.12,.055] if slender else [.26,.185,.075], bark))
        objects.append(_lobe(name+'-crown-'+str(i),center,size,phase,leaf,authored_crown=True))
    return objects


def _rocks(stone):
    objects = []
    # The tall back slab and lower forward shelves form a single fractured outcrop.
    slabs = [((-.48,.27),(.88,.64),1.67,.14), ((.56,.32),(.77,.59),1.33,.65),
             ((-.81,-.43),(.67,.49),.88,-.23), ((.38,-.55),(.88,.42),.68,.18),
             ((1.03,-.05),(.39,.47),.73,.45)]
    outline = [(-.84,-.69),(.30,-.91),(.92,-.43),(.83,.49),(.12,.86),(-.88,.51)]
    for index,(center,scale,height,rotation) in enumerate(slabs):
        vertices=[]
        for layer,(z,shrink,dx,dy) in enumerate([(0,1,0,0),(.60,1.03,-.035,.02),(1,.72,.055,.04)]):
            for j,(x,y) in enumerate(outline):
                a=x*scale[0]*shrink+dx; b=y*scale[1]*shrink+dy
                vertices.append((center[0]+a*math.cos(rotation)-b*math.sin(rotation),
                                 center[1]+a*math.sin(rotation)+b*math.cos(rotation),
                                 height*z*(1+(.05*math.sin(j*2.1+index) if layer else 0))))
        faces=[tuple(reversed(range(6)))]
        for layer in range(2):
            for j in range(6):
                faces.append((layer*6+j,layer*6+(j+1)%6,(layer+1)*6+(j+1)%6,(layer+1)*6+j))
        # Large top plane divided only where the fracture changes direction.
        faces.extend([(12,13,14,15),(12,15,16,17)])
        obj=mesh('rock-shelf-'+str(index),vertices,faces,stone[0])
        for mat in stone[1:]: obj.data.materials.append(mat)
        for face in obj.data.polygons:
            face.material_index=2 if face.normal.z>.65 else (1 if face.normal.x<-.3 else 0)
        objects.append(obj)
    return objects


def _meadow(grass, ivory, yellow):
    # Batches keep the exported patch small while retaining individually modeled
    # folded blades, bowed stems and five-petal cupped blossoms.
    batches = {key: ([],[]) for key in ('dark','leaf','tips','ivory','yellow')}
    def add(key,vertices,faces):
        vv,ff=batches[key]; offset=len(vv); vv.extend(vertices)
        ff.extend(tuple(i+offset for i in face) for face in faces)
    def blade(x,y,angle,height,width,bend,key):
        c,s=math.cos(angle),math.sin(angle)
        vertices=[]
        for t,w in [(0,.30),(.30,1),(.68,.67)]:
            offset=bend*t*t; z=height*t
            vertices.extend([(x+c*offset-s*width*w,y+s*offset+c*width*w,z),
                             (x+c*(offset+.015),y+s*(offset+.015),z+.014),
                             (x+c*offset+s*width*w,y+s*offset-c*width*w,z)])
        vertices.append((x+c*bend,y+s*bend,height*.88))
        add(key,vertices,[(0,3,4,1),(1,4,5,2),(3,6,7,4),(4,7,8,5),(6,9,7),(7,9,8)])
    clumps=[(-.94,-.28,.30),(-.60,.60,.37),(-.26,-.69,.44),(.14,.08,.50),
            (.55,.70,.29),(.88,-.31,.42),(-.82,-.76,.22),(.30,-.85,.30),(.90,.34,.31),(-.20,.66,.27)]
    for i,(x,y,h) in enumerate(clumps):
        for j in range(7):
            a=j*2.399+i*.73
            blade(x+.07*math.cos(a),y+.07*math.sin(a),a,h*(.73+.24*math.sin(j*1.7+i)**2),
                  .035+(j%3)*.007,.18+(j%3)*.06,('dark','leaf','tips')[(i+j)%3])
    flowers=[(-.78,-.14,.39),(-.51,.57,.47),(-.28,-.52,.55),(.24,.15,.58),(.41,.62,.36),
             (.94,-.20,.47),(-.65,-.66,.30),(.20,-.83,.38),(.90,.42,.41),(-.25,.87,.37),
             (.03,.63,.43),(.70,-.63,.32),(-1.0,.30,.29),(.56,.07,.46)]
    for i,(x,y,h) in enumerate(flowers):
        a=i*2.399; dx=.038*math.cos(a); dy=.038*math.sin(a)
        # Crossed thin ribbons give stems a volume readable from all directions.
        for angle in (0,math.pi/2):
            wx=.009*math.cos(angle); wy=.009*math.sin(angle)
            add('dark',[(x-wx,y-wy,0),(x+wx,y+wy,0),(x+dx+wx,y+dy+wy,h),(x+dx-wx,y+dy-wy,h)],[(0,1,2,3)])
        blade(x,y,a+1,.16,.025,.15,'leaf')
        cx,cy=x+dx,y+dy
        key='ivory' if i%3 else 'yellow'
        petal_length=.070 if key=='ivory' else .083
        for j in range(5):
            angle=a+j*math.tau/5; c,s=math.cos(angle),math.sin(angle)
            def p(r,w,z): return (cx+c*r-s*w,cy+s*r+c*w,h+z)
            add(key,[p(.009,0,0),p(petal_length*.54,-.029,.012),p(petal_length,-.014,.016),
                     p(petal_length+.007,0,.023),p(petal_length,.020,.020),p(petal_length*.48,.031,.011),p(petal_length*.5,0,.023)],
                [(0,1,6),(1,2,3,6),(3,4,5,6),(0,6,5)])
        add('yellow',[(cx,cy,h+.025)]+[(cx+.024*math.cos(j*math.tau/7),cy+.024*math.sin(j*math.tau/7),h+.017) for j in range(7)],
            [(0,j+1,(j+1)%7+1) for j in range(7)])
    mats={'dark':grass[0],'leaf':grass[1],'tips':grass[2],'ivory':ivory,'yellow':yellow}
    return [mesh('meadow-'+key,vertices,faces,mats[key]) for key,(vertices,faces) in batches.items()]


def build_assets() -> dict[str, list[bpy.types.Object]]:
    leaf=_palette('foliage-olive',['52612E','637437','78823D','929447'])
    tree_leaf=_palette('foliage-reference-canopy',['485D2B','566B30','697B35','82913D'])
    pink=_palette('foliage-blossom',['AA5365','C9697E','D97D8D','E5919B'])
    bark=_palette('bark',['725035','826044','60462F'])
    stone=_palette('coastal-stone',['8B8980','97958A','ABA79A'])
    for surface in stone:
        nodes,links=surface.node_tree.nodes,surface.node_tree.links
        shader=nodes.get('Principled BSDF')
        base=tuple(shader.inputs['Base Color'].default_value)
        coord=nodes.new('ShaderNodeTexCoord')
        noise=nodes.new('ShaderNodeTexNoise')
        noise.inputs['Scale'].default_value=78
        noise.inputs['Detail'].default_value=3
        links.new(coord.outputs['Generated'],noise.inputs['Vector'])
        ramp=nodes.new('ShaderNodeValToRGB')
        ramp.color_ramp.elements[0].color=(*(c*.80 for c in base[:3]),1)
        ramp.color_ramp.elements[1].color=(*(min(1,c*1.08) for c in base[:3]),1)
        links.new(noise.outputs['Fac'],ramp.inputs[0])
        links.new(ramp.outputs['Color'],shader.inputs['Base Color'])
        strata=nodes.new('ShaderNodeTexWave'); strata.wave_type='BANDS'; strata.bands_direction='Z'
        strata.inputs['Scale'].default_value=7
        strata.inputs['Distortion'].default_value=2.2
        strata.inputs['Detail Scale'].default_value=1.7
        links.new(coord.outputs['Generated'],strata.inputs['Vector'])
        height=nodes.new('ShaderNodeMath'); height.operation='MULTIPLY_ADD'
        height.inputs[1].default_value=.25
        links.new(strata.outputs['Fac'],height.inputs[0]);links.new(noise.outputs['Fac'],height.inputs[2])
        bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.26;bump.inputs['Distance'].default_value=.012
        links.new(height.outputs[0],bump.inputs['Height']);links.new(bump.outputs['Normal'],shader.inputs['Normal'])
    grass=_palette('meadow-grass',['576332','6E7839','8D9046'])
    # Each tuple is centre, anisotropic radii, authored rotation and trunk fork.
    oak=[((-1.16,-.06,4.90),(1.58,1.23,1.43),.37,1),((.97,.10,5.18),(1.51,1.20,1.28),1.27,1),
         ((-.26,.34,6.13),(1.18,1.07,1.08),2.13,2),((1.18,-.19,3.98),(1.02,.96,1.07),2.64,1)]
    # Rear reference: dominant left crown, high right crown and lower right
    # shoulder. Their different centres leave the broad Y-fork exposed.
    rounded=[((-1.06,-.07,4.94),(1.54,1.18,1.48),.38,1),((.76,.25,5.52),(1.16,1.05,1.14),1.67,2),
             ((1.12,-.04,3.87),(1.33,1.08,1.02),2.63,1)]
    slender=[((-.55,.11,4.33),(.87,.80,1.07),1.12,1),((.54,-.08,5.19),(.85,.75,1.16),2.65,2),
             ((-.20,.26,6.42),(.91,.76,1.04),.32,2),((.42,.39,6.07),(.66,.65,.94),1.65,2)]
    blossom=[((-.93,-.09,3.77),(1.29,1.08,1.19),.27,1),((.41,.14,5.09),(1.48,1.12,1.41),1.37,2),
             ((1.15,-.16,3.40),(1.02,.96,1.00),2.51,1)]
    assets={
        'tree-oak':_tree('oak',oak,[(0,0,0),(.07,.02,1.94),(-.22,.09,3.39),(-.20,.24,5.42)],tree_leaf,bark),
        'tree-round':_tree('round',rounded,[(0,0,0),(.08,.01,1.78),(-.19,.06,3.06),(.13,.20,4.91)],tree_leaf,bark,
            branches=[[(.02,.02,2.18),(-.69,-.01,2.95),(-1.04,-.06,4.63)],
                      [(-.19,.06,3.06),(.51,.18,4.02),(.76,.25,5.54)],
                      [(.06,.00,1.77),(1.03,-.03,2.58),(1.12,-.04,3.89)]]),
        'tree-slender':_tree('slender',slender,[(0,0,0),(-.10,.04,2.54),(.01,.11,4.12),(-.14,.21,6.1)],tree_leaf,bark,slender=True),
        'tree-blossom':_tree('blossom',blossom,[(0,0,0),(.10,.02,1.66),(-.12,.10,2.85),(.27,.14,4.77)],pink,bark),
        'rock-cluster':_rocks(stone),
        'meadow-patch':_meadow(grass,material('petal-ivory','EFE5C7',.8),material('petal-gold','E2BB4B',.85)),
    }
    shrubs=[((-.48,.08,.47),(.61,.49,.52),.8),((.35,.17,.56),(.63,.57,.61),2.1),
            ((.65,-.30,.32),(.38,.35,.35),.2),((-.18,-.32,.31),(.49,.39,.34),1.4)]
    assets['shrub-cluster']=[_lobe('shrub-'+str(i),c,s,a,leaf) for i,(c,s,a) in enumerate(shrubs)]
    for obj in assets['tree-slender']:
        for v in obj.data.vertices: v.co.x *= 1.1
    # Foliage geometry intentionally touches terrain; clip tiny crown bottom
    # excursions on shrubs so all asset bounds have a nonnegative ground plane.
    for obj in assets['shrub-cluster']:
        for v in obj.data.vertices: v.co.z=max(.015,v.co.z)
    for key,objects in assets.items():
        for obj in objects:
            obj['asset_key']=key
            obj['authoring']='reference-coast / deterministic modeled geometry'
            if key.startswith('tree-'):
                obj['geometry_version']='reference-match-20260908-v2'
    return assets
