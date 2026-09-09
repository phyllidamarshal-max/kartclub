import * as THREE from 'three';

/** Static coast atmosphere. Use the same helper in the visible and PMREM scenes. */
export function createCoastSky(scene: THREE.Scene): THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> {
  const material = new THREE.ShaderMaterial({
    name: 'coast-directional-atmosphere',
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      cloudStrength: { value: 1 },
      sunDirection: { value: new THREE.Vector3(52, 54, -33).normalize() },
      zenith: { value: new THREE.Color('#59a6c0') },
      coolHorizon: { value: new THREE.Color('#bbd5d0') },
      warmHorizon: { value: new THREE.Color('#eee4cc') },
      cloudLight: { value: new THREE.Color('#fff1d2') },
      cloudShade: { value: new THREE.Color('#abc1bf') },
    },
    vertexShader: `varying vec3 rayDirection;
      void main(){
        rayDirection=position;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
      }`,
    fragmentShader: `
      varying vec3 rayDirection;
      uniform vec3 sunDirection,zenith,coolHorizon,warmHorizon,cloudLight,cloudShade;
      uniform float cloudStrength;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){
        vec2 a=floor(p),b=fract(p);b=b*b*(3.-2.*b);
        return mix(mix(hash(a),hash(a+vec2(1.,0.)),b.x),mix(hash(a+vec2(0.,1.)),hash(a+1.),b.x),b.y);
      }
      float field(vec2 p,vec2 c,vec2 r){return 1.-length((p-c)/r);}
      vec2 cloud(vec2 ray,vec4 shape,float seed){
        shape.z*=.65;shape.w*=.80;
        float longitude=mod(ray.x-shape.x+3.14159265,6.2831853)-3.14159265;
        vec2 p=vec2(longitude/shape.z,(ray.y-shape.y)/shape.w);
        if(abs(p.x)>1.45||p.y<-.48||p.y>1.5)return vec2(0.);
        // Unequal piled forms, cut by a broken flat base. Local density gives
        // internal shade and scalloped shoulders instead of an icon outline.
        float density=field(p,vec2(-.73,.05),vec2(.56,.31));
        density=max(density,field(p,vec2(-.33,.30),vec2(.49,.64)));
        density=max(density,field(p,vec2(.05,.48),vec2(.44,.78)));
        density=max(density,field(p,vec2(.45,.18),vec2(.49,.48)));
        density=max(density,field(p,vec2(.82,-.02),vec2(.39,.24)));
        float grain=noise(p*5.7+seed)*.62+noise(p*13.1+seed)*.38;
        density+=(grain-.5)*.15;
        density=min(density,(p.y+.25+(grain-.5)*.10)*2.5);
        float alpha=smoothstep(-.065,.045,density);
        float sunSide=sin(atan(sunDirection.z,sunDirection.x)-shape.x);
        float form=clamp(.33+.42*p.y+.18*grain+sunSide*p.x*.16,0.,1.);
        return vec2(alpha,form);
      }
      void main(){
        vec3 d=normalize(rayDirection);
        vec2 horizontal=normalize(d.xz+vec2(.000001));
        float sunward=pow(clamp((dot(horizontal,normalize(sunDirection.xz))+.30)/1.30,0.,1.),1.5);
        float altitude=max(0.,d.y);
        float haze=exp(-altitude*10.0);
        vec3 horizon=mix(coolHorizon,warmHorizon,sunward*.92);
        vec3 color=mix(zenith,horizon,haze);
        // Broad forward scattering is fixed in world azimuth, so opposite
        // cameras see different warmth while reflections retain the same sun.
        float glow=pow(max(0.,dot(d,sunDirection)),4.0);
        color=mix(color,warmHorizon,glow*.08+sunward*exp(-altitude*7.5)*.32);
        vec2 ray=vec2(atan(d.z,d.x),d.y),cloudValue=vec2(0.);
        vec2 c;
        c=cloud(ray,vec4(-3.00,.135,.13,.047),1.1);if(c.x>cloudValue.x)cloudValue=c;
        c=cloud(ray,vec4(-2.55,.285,.19,.078),4.7);if(c.x>cloudValue.x)cloudValue=c;
        c=cloud(ray,vec4(-1.96,.095,.105,.029),8.3);if(c.x>cloudValue.x)cloudValue=c;
        c=cloud(ray,vec4(-1.25,.115,.10,.027),12.1);if(c.x>cloudValue.x)cloudValue=c;
        c=cloud(ray,vec4(-.78,.100,.09,.030),15.9);if(c.x>cloudValue.x)cloudValue=c;
        c=cloud(ray,vec4(-.19,.275,.17,.067),19.4);if(c.x>cloudValue.x)cloudValue=c;
        c=cloud(ray,vec4(.39,.135,.115,.042),23.2);if(c.x>cloudValue.x)cloudValue=c;
        c=cloud(ray,vec4(.85,.145,.065,.022),27.5);if(c.x>cloudValue.x)cloudValue=c;
        c=cloud(ray,vec4(1.45,.215,.12,.048),31.3);if(c.x>cloudValue.x)cloudValue=c;
        c=cloud(ray,vec4(2.06,.215,.105,.037),35.1);if(c.x>cloudValue.x)cloudValue=c;
        c=cloud(ray,vec4(2.58,.295,.15,.063),38.7);if(c.x>cloudValue.x)cloudValue=c;
        vec3 litCloud=mix(cloudShade,cloudLight,smoothstep(.05,.86,cloudValue.y));
        litCloud=mix(litCloud,horizon,exp(-altitude*12.)*.32);
        color=mix(color,litCloud,cloudValue.x*.94*smoothstep(.015,.065,d.y)*cloudStrength);
        gl_FragColor=vec4(color,1.);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2100, 32, 16), material);
  sky.name = 'coast-static-sky';
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  sky.userData.dynamic = true; // Prevent static scenery batching; World recentres it.
  sky.userData.lighting = 'fixed world sun: 52,54,-33; static cloud field';
  scene.add(sky);
  return sky;
}
