"""Cottage-only structural/export checks and delivery; never touches other assets.

Blender Python: validate_junctions.py --source
System Python/Pillow: validate_junctions.py --deliver
"""
import argparse
import io
import json
import math
import struct
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
PUBLIC=ROOT/'public/art/coast-rebuild'
SPECS={'cottage-hero':(6.2,5.9,5.45,8.0,-1.5,5.5),
       'cottage-gable':(4.85,6.6,4.88,7.18,0,5.4),
       'cottage-low':(7.35,5.1,3.15,4.43,-1.45,5.6)}


def source_checks(generated=False):
    import bpy
    import bmesh
    results=[]
    if generated:
        from architecture import build_assets
        library=build_assets()
    for key,(w,d,eave,peak,doorx,limit) in SPECS.items():
        if generated: objects=library[key]
        else:
            bpy.ops.wm.open_mainfile(filepath=str(ROOT/'art/coast-rebuild'/f'{key}.blend'))
            objects=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.name.startswith(key+'-')]
        def find(suffix): return next(o for o in objects if o.name==key+'-'+suffix)
        def pts(ob): return [ob.matrix_world@v.co for v in ob.data.vertices]
        def bounds(ob):
            p=pts(ob)
            return [[min(v[i] for v in p),max(v[i] for v in p)] for i in range(3)]
        radius=max(math.hypot(p.x,p.y) for ob in objects for p in pts(ob))
        assert radius<=limit, (key,radius,limit)
        assert abs(min(p.z for ob in objects for p in pts(ob)))<1e-5
        tris=0; negative=[]; open_meshes=[]
        for ob in objects:
            ob.data.calc_loop_triangles(); tris+=len(ob.data.loop_triangles)
            bm=bmesh.new(); bm.from_mesh(ob.data)
            if any(not e.is_manifold for e in bm.edges): open_meshes.append(ob.name)
            if bm.calc_volume(signed=True)<-1e-7: negative.append(ob.name)
            bm.free()
        assert not negative,(key,negative)
        assert not open_meshes,(key,open_meshes)
        roofgaps=[]
        for ob in objects:
            if 'main-roof-solid-eave' not in ob.name: continue
            p=pts(ob); ridge=min(v.z for v in p if abs(v.x)<1e-5)
            outer=max(abs(v.x) for v in p)
            edge=min(v.z for v in p if abs(abs(v.x)-outer)<1e-5)
            wall_roof=ridge+(edge-ridge)*(w/2)/outer
            roofgaps += [ridge-peak,wall_roof-eave]
        assert max(abs(g) for g in roofgaps)<1e-5
        landing=bounds(find('porch-landing')); middle=bounds(find('porch-middle-step')); bottom=bounds(find('porch-bottom-step'))
        tops=[bottom[2][1],middle[2][1],landing[2][1]]
        rises=[tops[0],tops[1]-tops[0],tops[2]-tops[1]]
        assert all(abs(v-.12)<1e-6 for v in rises)
        assert abs(landing[1][0]-middle[1][1])<1e-6
        assert abs(middle[1][0]-bottom[1][1])<1e-6
        sill=bounds(find('front-opening-0-sill'))
        assert abs(sill[2][1]-landing[2][1])<1e-6
        contacts=[]
        posts=[o for o in objects if o.name.startswith(key+'-porch-post')]
        shoes=[o for o in objects if o.name.startswith(key+'-porch-stone-shoe')]
        for post in posts:
            shoe=min(shoes,key=lambda s:abs(s.location.x-post.location.x))
            pb,sb,hb=bounds(post),bounds(shoe),bounds(find('porch-header'))
            gaps=[sb[2][0]-landing[2][1],pb[2][0]-sb[2][1],hb[2][0]-pb[2][1]]
            assert max(abs(g) for g in gaps)<1e-6
            contacts.append(gaps)
        if posts:
            hb=bounds(find('porch-header'))
            for rafter in [o for o in objects if o.name.startswith(key+'-porch-rafter')]:
                # Check a real rafter vertex lies inside its bearing, rather
                # than merely comparing separately computed nominal heights.
                assert any(all(hb[axis][0]+.005 < v[axis] < hb[axis][1]-.005 for axis in range(3)) for v in pts(rafter)), rafter.name
        def pipe_ends(ob):
            # Derive cap centres from actual cylinder vertices, not joint labels.
            zvalues=[v.co.z for v in ob.data.vertices]
            ends=[]
            for z in (min(zvalues),max(zvalues)):
                cap=[v.co for v in ob.data.vertices if abs(v.co.z-z)<1e-5]
                centre=sum(cap,cap[0]*0)/len(cap)
                ends.append(ob.matrix_world@centre)
            return ends
        pipe_gaps=[]
        for stem in ('main-drain-elbow','main-downpipe','main-drain-shoe','porch-downpipe','porch-drain-shoe','wing-downpipe'):
            for ob in [o for o in objects if o.name.startswith(key+'-'+stem)]:
                top=max(pipe_ends(ob),key=lambda p:p.z)
                others=[q for o in objects if o!=ob and 'jointStart' in o and ('gutter' in o.name or 'drain' in o.name or 'downpipe' in o.name) for q in pipe_ends(o)]
                gap=min((top-q).length for q in others)
                assert gap<1e-5,(ob.name,gap)
                pipe_gaps.append(gap)
        wing_gaps=[]
        if key=='cottage-low':
            deck=pts(find('wing-roof-deck'))
            y0=min(p.y for p in deck); y1=max(p.y for p in deck)
            z0=min(p.z for p in deck if abs(p.y-y0)<1e-5)
            z1=min(p.z for p in deck if abs(p.y-y1)<1e-5)
            for wall in [o for o in objects if 'wing-side-wall' in o.name]:
                for p in pts(wall):
                    if p.z>1:
                        gap=z0+(z1-z0)*(p.y-y0)/(y1-y0)-p.z
                        assert abs(gap)<.001,(wall.name,gap)
                        wing_gaps.append(gap)
        results.append({'key':key,'triangles':tris,'objects':len(objects),'radius':radius,'footprintLimit':limit,
                        'frontWallY':-d/2,'doorX':doorx,'landingY':landing[1],
                        'stepOuterY':bottom[1][0],'treadRises':rises,'doorSillTop':sill[2][1],
                        'roofWallGaps':roofgaps,'postContactGaps':contacts,'pipeEndpointGaps':pipe_gaps,'wingRoofWallGaps':wing_gaps,
                        'negativeVolumeObjects':negative,'nonManifoldObjects':open_meshes})
    return results


def delivery():
    from PIL import Image
    from pack import pack_glb,png8
    records=[]
    for key in SPECS:
        path=PUBLIC/f'{key}.glb'; packed_before,packed_after=pack_glb(path)
        for suffix in ('color','normal','orm','indirect'):
            p=PUBLIC/f'{key}-{suffix}.png'; p.write_bytes(png8(p.read_bytes()))
        data=path.read_bytes(); size=struct.unpack_from('<I',data,12)[0]
        assert struct.unpack_from('<I',data,8)[0]==len(data)
        doc=json.loads(data[20:20+size]); binary=data[28+size:]
        meta=json.loads((PUBLIC/f'{key}.json').read_text(encoding='utf-8'))
        tris=0
        for m in doc['meshes']:
            for p in m['primitives']:
                assert {'POSITION','NORMAL','TEXCOORD_0','TEXCOORD_1'}<=p['attributes'].keys()
                tris+=doc['accessors'][p['indices']]['count']//3
                for semantic,index in p['attributes'].items():
                    a=doc['accessors'][index]; v=doc['bufferViews'][a['bufferView']]
                    components={'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
                    assert a['componentType']==5126
                    start=v.get('byteOffset',0)+a.get('byteOffset',0); stride=v.get('byteStride',4*components)
                    vals=[struct.unpack_from('<'+'f'*components,binary,start+i*stride) for i in range(a['count'])]
                    assert all(math.isfinite(x) for row in vals for x in row)
                    if semantic.startswith('TEXCOORD'): assert all(-.001<=x<=1.001 for row in vals for x in row)
                mat=doc['materials'][p['material']]
                assert {'baseColorTexture','metallicRoughnessTexture'}<=mat['pbrMetallicRoughness'].keys()
                assert 'normalTexture' in mat and mat['occlusionTexture'].get('texCoord')==1
        assert tris==meta['triangles']
        for im in doc['images']:
            v=doc['bufferViews'][im['bufferView']]; raw=binary[v['byteOffset']:v['byteOffset']+v['byteLength']]
            assert raw[24]==8
            decoded=Image.open(io.BytesIO(raw)); decoded.load()
            assert decoded.size==(meta['atlasSize'],meta['atlasSize'])
        baseline=ROOT/'output/visual-round2-20260909/baseline/public/art/coast-rebuild'
        before=json.loads((baseline/f'{key}.json').read_text(encoding='utf-8'))
        before_bytes=(baseline/f'{key}.glb').stat().st_size+(baseline/f'{key}-indirect.png').stat().st_size
        after_bytes=len(data)+(PUBLIC/f'{key}-indirect.png').stat().st_size
        meta['version']='architectural-junctions-20260909-v2'
        (PUBLIC/f'{key}.json').write_text(json.dumps(meta,indent=2),encoding='utf-8')
        records.append({'key':key,'beforeTriangles':before['triangles'],'afterTriangles':tris,
                        'beforeRuntimeBytes':before_bytes,'afterRuntimeBytes':after_bytes,
                        'unpackedGlbBytes':packed_before,'packedGlbBytes':packed_after})
    # Read immediately before writing so unrelated entries retain current values.
    manifest_path=PUBLIC/'manifest.json'; manifest=json.loads(manifest_path.read_text(encoding='utf-8'))
    for i,m in enumerate(manifest['assets']):
        if m['key'] in SPECS: manifest['assets'][i]=json.loads((PUBLIC/(m['key']+'.json')).read_text(encoding='utf-8'))
    manifest_path.write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    return records


if __name__=='__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--source',action='store_true'); parser.add_argument('--geometry',action='store_true'); parser.add_argument('--deliver',action='store_true')
    args=parser.parse_args()
    result=source_checks(args.geometry) if args.source or args.geometry else delivery() if args.deliver else parser.error('choose --source, --geometry or --deliver')
    print(json.dumps(result,indent=2),flush=True)
    if args.source or args.geometry:
        import os
        os._exit(0)
