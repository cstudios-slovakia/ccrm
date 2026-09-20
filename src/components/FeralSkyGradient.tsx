import React, { useEffect, useRef, useState } from "react";

// Exact film grain overlay extracted from FeralUI export (docs/sky.html)
const FILM_GRAIN_BASE64 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAYAAABccqhmAAAQAElEQVR4AUzdBXAmR5IF4Mxe8rKXvSwz22Mes8xsj3nMMo+ZmZmZmZmZmZmZmZmxrr6a6Iu9CIWkv7urMl++9zKrNeft1l577bLDDjuUVVZZpey1117l888/LxtuuGGZdNJJy1lnnVWOPPLI8ve//72cfPLJxb1nnHFGeemll8oKK6xQFlpooTJixIiy5pprlhNOOKFsttlm5corr2zX1lprrbbOBhtsUHbfffdy8cUXtzWuuOKKsvnmm5epp566nH322W3fVVddtVx33XVl5ZVXLueee2657bbbyg033FD22Wefsthii5VxxhmnxTLddNOVI444ohxzzDFlxhlnbPvcfvvt5ZBDDilHHXVU2WabbVou2267bYtHHgcccECx/jTTTFM23XTT9syhhx5aVltttSJG+4lfnlNMMUXZbrvtypJLLlm22mqrcv3115eTTjqpXHbZZeXUU09tucrn5ZdfLltuuWVZcMEFyzzzzFOWXnrpssYaa5TjjjuuLLroomXFFVcszz//fFliiSXKRBNNVBZffPGyxRZblP/85z/l5ptvbvs+8MADDVu4W+vaa68tZ555ZtvnkksuaXtutNFG5d///nex5/rrr19OOeWUhsOBBx5YVl999bYn/NXvtddeK6NGjWo1ePrpp8uuu+5aPC9PeFhnr1pf+J144oktR7W89dZby+OPP1723XffFo/4P/7447LbbruVaaedtuH92WefNexgvNJKK5Vlllmm4XTjjTe2+2AFC/WHtbWGDx/e6g9TtX/zzTfLBRdc0DDFnfPOO6889thjZeONNy7vvvtuy+eZZ55ptYLjaaed1jiyxx57lKGhobLwwguX6aefvtjTdZ+rLdztb+0pp5yyLLDAAgV+Sy21VBk5cmS5+uqryyyzzNJwh6Pn1Vqsrh9//PHl2WefLccee2xZZJFFCmxxQPz7779/21tdcMJal156aXnooYeK5w4++OBy1VVXNa7de++95fTTTy8zzDBDq9Mcc8zRam4PHHrjjTfK+OOPX/bbb7/Gk8HBwSLH5ZdfvsjjmmuuaVyHndhcUwPcwt255pqr9GtedNFFjQf4Cxufb7/99kWd77vvvjLrrLM2HUw44YQFb2iSNqaaaqoy3njjNUxwxR5dBS4qQFFJHRNPPHHUJOLtt9+OH3/8sf3+u9/9Ls4555yopIkXXnghfv7zn0cVQ8w555ztey1sVGDaM1988UVUQKIWJWqBoxY0fv3rX4fPa1Lxhz/8IWogUQUX8847b/u5JhkzzTRTPPzww/H111/HSy+9FF999VVU04hK+KjJxXLLLRfvvPNO/P73v49qUG0vce+9995x/vnnRxVA/POf/4xqVPGTn/wkZptttqgiiIGBgRhzzDGjJh3zzz9/W6sSLv7yl7/Eq6++GpW08cgjj0QtRlSAY+edd255wUFM66yzTvzpT3+KWuz47rvvohI2quBbLHfffXdUk2wx/epXv4oJJpigYVbNKv74xz9GLURUUbbYhw0bFhdeeGF88MEHUQ2r4VgLF7VALfcHH3wwqshaXpXkccstt8RHH33UYqnFjy+//DKqsFpucCmlRDWWePHFF6Mab3z77bfx3HPPxZ///OeoRGu4Wg8O1WDi+++/j2qSrcZqKHf1q0IJdbHmz372s7j88stbPNWMwv9Vk44qqKiGGdVAGr6V6PGb3/wmHn300bB2FUZUEwnPwwsuOKIm4447btx1113x1FNPRW0eLQb7/+Mf/4hK4rjnnntajjvuuGNbUy5zzz13VKNqPMPLKoyAL/zV7eCDD45qnlHF1HDBlXXXXTfEpTbVTBuHaoNouFQxh/WrcGNgYKA9+9ZbbwVe2wtunvvb3/7WcsX7l19+ufETB+wpXtz1/fXXXw/c+vDDD1vt1RTm+Dv77LNHNZ6w1iabbNJqrn54DatRo0bFT3/606hija233jrgPNlkkzUM1NQz7s3MxkscqEYf1YibFtUTpjRiHRqafPLJ47///W/UZhp//etfozbHxhU1w6XapBtPqjEF7lfzDZjgYzXD6KqjN4ETMpEDkpiIr3brqO7XwJq/Cqh2jyZoydfuFtVJo7QI";

// Vertex shader
const VS_SOURCE = `
  attribute vec2 p;
  void main(){
    gl_Position = vec4(p, 0.0, 1.0);
  }
`;

// Extracted FeralUI fragment shader
const FS_SOURCE = `
  precision highp float;
  uniform vec2 u_res;
  uniform float u_t;
  uniform vec3 u_main;
  uniform vec3 u_low;
  uniform vec3 u_mid;
  uniform vec3 u_high;
  uniform float u_wind;
  uniform float u_warp;
  uniform float u_nscale;
  uniform sampler2D u_noise;
  uniform vec2 u_dirv;

  const float FBM_STRENGTH = 0.912;
  const float BLUR_RADIUS = 1.2673;
  const float ZOOM = 0.3971;
  const float GRAIN_SCALE = 2.5;
  const float GRAIN_STRENGTH = 0.014;

  vec3 burn(vec3 base, vec3 blend, float op){
    return max(base + blend - vec3(1.0), vec3(0.0))*op + base*(1.0-op);
  }
  float rand2(vec2 n){ return fract(sin(dot(n, vec2(12.9898, 4.1414)))*43758.5453); }
  float noise2(vec2 p){
    vec2 ip = floor(p); vec2 u = fract(p);
    u = u*u*(3.0-2.0*u);
    float m = mix(mix(rand2(ip), rand2(ip+vec2(1.,0.)), u.x), mix(rand2(ip+vec2(0.,1.)), rand2(ip+vec2(1.,1.)), u.x), u.y);
    return m*m;
  }
  float fbm4(vec2 x){
    float v = 0.0; float a = 0.5;
    vec2 shift = vec2(100.0);
    mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
    for (int i = 0; i < 4; i++) { v += a*noise2(x); x = rot*x*2.0 + shift; a *= 0.5; }
    return v;
  }
  vec4 permute4(vec4 x){ return mod((x*34.0 + 1.0)*x, 289.0); }
  vec4 tisqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314*r; }
  vec3 fade3(vec3 t){ return t*t*t*(t*(t*6.0-15.0)+10.0); }
  float cnoise(vec3 P){
    vec3 Pi0 = floor(P); vec3 Pi1 = Pi0 + vec3(1.0);
    Pi0 = mod(Pi0, 289.0); Pi1 = mod(Pi1, 289.0);
    vec3 Pf0 = fract(P); vec3 Pf1 = Pf0 - vec3(1.0);
    vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
    vec4 iy = vec4(Pi0.yy, Pi1.yy);
    vec4 iz0 = vec4(Pi0.z); vec4 iz1 = vec4(Pi1.z);
    vec4 ixy = permute4(permute4(ix) + iy);
    vec4 ixy0 = permute4(ixy + iz0); vec4 ixy1 = permute4(ixy + iz1);
    vec4 gx0 = ixy0/7.0; vec4 gy0 = fract(floor(gx0)/7.0) - 0.5; gx0 = fract(gx0);
    vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0); vec4 sz0 = step(gz0, vec4(0.0));
    gx0 -= sz0*(step(vec4(0.0), gx0) - 0.5); gy0 -= sz0*(step(vec4(0.0), gy0) - 0.5);
    vec4 gx1 = ixy1/7.0; vec4 gy1 = fract(floor(gx1)/7.0) - 0.5; gx1 = fract(gx1);
    vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1); vec4 sz1 = step(gz1, vec4(0.0));
    gx1 -= sz1*(step(vec4(0.0), gx1) - 0.5); gy1 -= sz1*(step(vec4(0.0), gy1) - 0.5);
    vec3 g000 = vec3(gx0.x, gy0.x, gz0.x); vec3 g100 = vec3(gx0.y, gy0.y, gz0.y);
    vec3 g010 = vec3(gx0.z, gy0.z, gz0.z); vec3 g110 = vec3(gx0.w, gy0.w, gz0.w);
    vec3 g001 = vec3(gx1.x, gy1.x, gz1.x); vec3 g101 = vec3(gx1.y, gy1.y, gz1.y);
    vec3 g011 = vec3(gx1.z, gy1.z, gz1.z); vec3 g111 = vec3(gx1.w, gy1.w, gz1.w);
    vec4 n0 = tisqrt(vec4(dot(g000,g000), dot(g010,g010), dot(g100,g100), dot(g110,g110)));
    g000 *= n0.x; g010 *= n0.y; g100 *= n0.z; g110 *= n0.w;
    vec4 n1 = tisqrt(vec4(dot(g001,g001), dot(g011,g011), dot(g101,g101), dot(g111,g111)));
    g001 *= n1.x; g011 *= n1.y; g101 *= n1.z; g111 *= n1.w;
    float n000 = dot(g000, Pf0); float n100 = dot(g100, vec3(Pf1.x, Pf0.yz));
    float n001 = dot(g001, vec3(Pf0.xy, Pf1.z)); float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
    float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z)); float n110 = dot(g110, vec3(Pf1.xy, Pf0.z));
    float n011 = dot(g011, vec3(Pf0.x, Pf1.yz)); float n111 = dot(g111, Pf1);
    vec3 fx = fade3(Pf0);
    vec4 nz = mix(vec4(n000,n100,n010,n110), vec4(n001,n101,n011,n111), fx.z);
    vec2 ny = mix(nz.xy, nz.zw, fx.y);
    return 2.2*mix(ny.x, ny.y, fx.x);
  }

  void main(){
    vec2 st = gl_FragCoord.xy/u_res - 0.5;
    st.x *= u_res.x/u_res.y;
    st = mat2(u_dirv.x, u_dirv.y, -u_dirv.y, u_dirv.x)*st;
    float time = u_t*0.85;
    vec2 uv = st*(1.0/(2.0*ZOOM)) + 0.5;
    float noiseX = cnoise(vec3(uv*u_nscale + vec2(0.0, 74.8572), time*0.3));
    float noiseY = cnoise(vec3(uv*u_nscale + vec2(203.91282, 10.0), time*0.3));
    uv += vec2(noiseX*2.0, noiseY)*u_warp;
    float noiseA = cnoise(vec3(uv*18.0 + vec2(344.91282, 0.0), time*0.3))
                 + cnoise(vec3(uv*39.6 + vec2(723.937, 0.0), time*0.4))*0.5;
    uv += noiseA*0.02;
    uv.y -= 0.09;
    float xf = (sin(time) + 1.0)*0.5;
    vec2 texUv = uv*GRAIN_SCALE;
    float d0 = mix(texture2D(u_noise, texUv).r - 0.5, texture2D(u_noise, vec2(texUv.x, 1.0-texUv.y)).g - 0.5, xf)*GRAIN_STRENGTH;
    texUv += vec2(63.861, 368.937);
    float d1 = mix(texture2D(u_noise, texUv).r - 0.5, texture2D(u_noise, vec2(texUv.x, 1.0-texUv.y)).g - 0.5, xf)*GRAIN_STRENGTH;
    texUv += vec2(453.163, 1649.808);
    float d3 = mix(texture2D(u_noise, texUv).r - 0.5, texture2D(u_noise, vec2(texUv.x, 1.0-texUv.y)).g - 0.5, xf)*GRAIN_STRENGTH;
    uv += d0;
    vec2 stF = uv*u_nscale;
    vec2 q = vec2(fbm4(stF*0.5 + u_wind*time));
    vec2 r = vec2(fbm4(stF + q + vec2(0.3, 9.2) + 0.15*time), fbm4(stF + q + vec2(8.3, 0.8) + 0.126*time));
    float fv = fbm4(stF + r - q);
    float full = (fv + 0.6*fv*fv + 0.7*fv + 0.5)*0.5;
    full = pow(full, 0.55)*FBM_STRENGTH;
    float blurR = BLUR_RADIUS*1.5;
    vec2 uvA = uv + vec2((full-0.5)*1.2) + vec2(0.0, 0.025) + d0;
    float snA = noise2(uvA*2.0 + vec2(0.0, time*0.5))*3.0;
    float lA = pow(smoothstep(snA - 1.2*blurR, snA + 1.2*blurR, (uvA.y - 0.5)*5.0 + 0.5), 0.8);
    vec2 uvB = uv + vec2((full-0.5)*0.85) + vec2(0.0, 0.025) + d1;
    float snB = noise2(uvB*4.0 + vec2(293.0, time))*2.8;
    float lB = pow(smoothstep(snB - 0.9*blurR, snB + 0.9*blurR, (uvB.y - 0.6)*5.0 + 0.5), 0.9);
    vec2 uvC = uv + vec2((full-0.5)*1.1) + d3;
    float snC = noise2(uvC*6.0 + vec2(153.0, time*1.2))*2.6;
    float lC = smoothstep(snC - 0.7*blurR, snC + 0.7*blurR, (uvC.y - 0.9)*6.0 + 0.5);
    vec3 col = burn(u_main, u_low, 1.0 - lA);
    col = burn(col, mix(u_main, u_mid, 1.0 - lB), lA);
    col = mix(col, mix(u_main, u_high, 1.0 - lC), lA*lB);
    gl_FragColor = vec4(col, 1.0);
  }
`;

interface FeralSkyGradientProps {
  className?: string;
}

export const FeralSkyGradient: React.FC<FeralSkyGradientProps> = ({ className }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hasWebGL, setHasWebGL] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
    try {
      gl = canvas.getContext("webgl2", { alpha: false, antialias: false, powerPreference: "default" }) as any;
      if (!gl) {
        gl = canvas.getContext("webgl", { alpha: false, antialias: false }) as any;
      }
    } catch {
      gl = null;
    }

    if (!gl) {
      setHasWebGL(false);
      return;
    }

    const createShader = (type: number, source: string) => {
      const shader = gl!.createShader(type);
      if (!shader) return null;
      gl!.shaderSource(shader, source);
      gl!.compileShader(shader);
      if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) {
        gl!.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vs = createShader(gl.VERTEX_SHADER, VS_SOURCE);
    const fs = createShader(gl.FRAGMENT_SHADER, FS_SOURCE);
    if (!vs || !fs) {
      setHasWebGL(false);
      return;
    }

    const prog = gl.createProgram();
    if (!prog) {
      setHasWebGL(false);
      return;
    }

    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);

    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      setHasWebGL(false);
      return;
    }

    gl.useProgram(prog);

    // Quad geometry
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    const posLoc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    // Noise Texture
    const noiseTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, noiseTex);
    const size = 256;
    const data = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size * 4; i += 4) {
      data[i] = Math.floor(Math.random() * 256);
      data[i + 1] = Math.floor(Math.random() * 256);
      data[i + 2] = Math.floor(Math.random() * 256);
      data[i + 3] = 255;
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // Uniform locations
    const uResLoc = gl.getUniformLocation(prog, "u_res");
    const uTLoc = gl.getUniformLocation(prog, "u_t");
    const uMainLoc = gl.getUniformLocation(prog, "u_main");
    const uLowLoc = gl.getUniformLocation(prog, "u_low");
    const uMidLoc = gl.getUniformLocation(prog, "u_mid");
    const uHighLoc = gl.getUniformLocation(prog, "u_high");
    const uWindLoc = gl.getUniformLocation(prog, "u_wind");
    const uWarpLoc = gl.getUniformLocation(prog, "u_warp");
    const uNscaleLoc = gl.getUniformLocation(prog, "u_nscale");
    const uDirvLoc = gl.getUniformLocation(prog, "u_dirv");
    const uNoiseLoc = gl.getUniformLocation(prog, "u_noise");

    // Exact FeralUI Blue Sky parameters
    gl.uniform3f(uMainLoc, 0.70196, 0.85098, 1.0); // #B3D9FF
    gl.uniform3f(uLowLoc, 0.4, 0.6, 0.90196);      // #6699E6
    gl.uniform3f(uMidLoc, 0.50196, 0.70196, 1.0);  // #80B3FF
    gl.uniform3f(uHighLoc, 0.90196, 0.94902, 1.0); // #E6F2FF
    gl.uniform1f(uWindLoc, 0.144);
    gl.uniform1f(uWarpLoc, 0.235);
    gl.uniform1f(uNscaleLoc, 0.8675);
    gl.uniform2f(uDirvLoc, 1.0, 0.0);
    gl.uniform1i(uNoiseLoc, 0);

    const resize = () => {
      if (!canvas || !gl) return;
      // Use low-dpr rendering for smooth performance
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.floor((canvas.clientWidth || window.innerWidth) * dpr);
      const h = Math.floor((canvas.clientHeight || window.innerHeight) * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uResLoc, w, h);
    };

    window.addEventListener("resize", resize);
    resize();

    let animationId: number;
    let isTabVisible = true;
    const startTime = performance.now();

    const onVisibilityChange = () => {
      isTabVisible = !document.hidden;
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    const render = () => {
      if (isTabVisible && gl) {
        const t = (performance.now() - startTime) / 1000.0;
        gl.uniform1f(uTLoc, t);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      animationId = requestAnimationFrame(render);
    };

    animationId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (gl) {
        if (buf) gl.deleteBuffer(buf);
        if (noiseTex) gl.deleteTexture(noiseTex);
        if (prog) gl.deleteProgram(prog);
        if (vs) gl.deleteShader(vs);
        if (fs) gl.deleteShader(fs);
      }
    };
  }, []);

  return (
    <div className={`absolute inset-0 w-full h-full overflow-hidden pointer-events-none select-none ${className || ""}`}>
      {/* Dynamic Animated WebGL Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full h-full absolute inset-0 block object-cover"
        style={{ background: "#E6F2FF" }}
      />

      {/* Fallback Static Gradient Mesh if WebGL disabled */}
      {!hasWebGL && (
        <div
          className="absolute inset-0 w-full h-full"
          style={{
            background: "radial-gradient(ellipse at 70% 20%, #E6F2FF 0%, #B3D9FF 40%, #80B3FF 70%, #6699E6 100%)"
          }}
        />
      )}

      {/* Film grain SVG overlay extracted from FeralUI sky.html */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none opacity-20"
        style={{ mixBlendMode: "overlay" }}
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <pattern id="sky-grain" width="256" height="256" patternUnits="userSpaceOnUse">
            <image href={FILM_GRAIN_BASE64} width="256" height="256" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#sky-grain)" />
      </svg>
    </div>
  );
};
