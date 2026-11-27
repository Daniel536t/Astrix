import{U as Dt,c as Wa,N as Nt,S as fn,C as He,M as yt,R as za,e as et,w as ze,V as Et,l as Ui,F as jr,W as Di,a as Rt,b as tt,L as Yt,H as Vt,D as It,B as xt,d as un,f as Le,p as Xa,g as Ii,h as Ka,i as Ya,A as _n,O as qa,j as Za,k as $a,m as ja,n as Qa,o as Ja,q as eo,r as to,s as no,t as io,u as ro,v as ao,x as oo,y as so,Z as co,z as Qr,E as yn,G as On,I as Un,J as mt,K as En,P as Jr,Q as Bt,T as lo,X as fo,Y as gi,_ as uo,$ as vi,a0 as po,a1 as ho,a2 as mo,a3 as Fe,a4 as _o,a5 as go,a6 as vo,a7 as kt,a8 as _t,a9 as en,aa as Qt,ab as Ot,ac as Dn,ad as So,ae as Ht,af as xn,ag as dn,ah as Fn,ai as qt,aj as pn,ak as Eo,al as Jt,am as Ni,an as xo,ao as Si,ap as Qe,aq as Mo,ar as Tn,as as To,at as zn,au as Gt,av as on,aw as Rn,ax as Ao,ay as Ro,az as bo,aA as an,aB as ea,aC as ta,aD as na,aE as Bn,aF as ia,aG as ra,aH as Co,aI as Lo,aJ as Po,aK as wo,aL as Uo,aM as Do,aN as Io,aO as No,aP as yi,aQ as yo,aR as In,aS as Oo,aT as Oi,aU as Fi,aV as Bi,aW as Fo,aX as Gn,aY as Gi,aZ as Bo,a_ as Ei,a$ as ci,b0 as aa,b1 as oa,b2 as sa,b3 as Go,b4 as ca,b5 as Ho,b6 as Vo,b7 as ko,b8 as Wo,b9 as la,ba as zo,bb as Xo,bc as Ko,bd as Xn,be as Kn,bf as Yn,bg as qn,bh as Hi,bi as Vi,bj as ki,bk as Wi,bl as zi,bm as Xi,bn as Ki,bo as Yi,bp as qi,bq as li,br as Zi,bs as $i,bt as ji,bu as Qi,bv as Ji,bw as er,bx as tr,by as nr,bz as ir,bA as rr,bB as ar,bC as or,bD as sr,bE as cr,bF as lr,bG as fr,bH as ur,bI as dr,bJ as pr,bK as hr,bL as fi,bM as mr,bN as fa,bO as _r,bP as ua,bQ as gr,bR as St,bS as Yo,bT as da,bU as pa,bV as ha,bW as ma,bX as _a,bY as ga,bZ as va,b_ as Zn,b$ as $n,c0 as qo,c1 as Zo,c2 as bt,c3 as bn,c4 as hn,c5 as sn,c6 as $o,c7 as jo,c8 as Qo,c9 as Jo,ca as es,cb as ui,cc as ts,cd as ns,ce as is,cf as rs,cg as di,ch as Sa,ci as as,cj as An,ck as Ea,cl as Ft,cm as os,cn as ss,co as cs,cp as ls,cq as xa,cr as vr,cs as Ma,ct as fs,cu as us,cv as ds,cw as ps,cx as jn,cy as hs,cz as Ta,cA as ms,cB as _s,cC as gs,cD as vs,cE as Ss,cF as Es,cG as Qn,cH as xs,cI as Ms,cJ as Ts,cK as As,cL as Rs,cM as Aa,cN as bs,cO as Sr,cP as Er,cQ as xr,cR as Cs,cS as Ls,cT as Ps}from"./three-core-5hcbeJDr.js";function Ra(){let e=null,n=!1,t=null,i=null;function a(r,o){i=e.requestAnimationFrame(a),t(r,o)}return{start:function(){n!==!0&&t!==null&&e!==null&&(i=e.requestAnimationFrame(a),n=!0)},stop:function(){e!==null&&e.cancelAnimationFrame(i),n=!1},setAnimationLoop:function(r){t=r},setContext:function(r){e=r}}}function ws(e){const n=new WeakMap;function t(c,l){const d=c.array,_=c.usage,g=d.byteLength,p=e.createBuffer();e.bindBuffer(l,p),e.bufferData(l,d,_),c.onUploadCallback();let v;if(d instanceof Float32Array)v=e.FLOAT;else if(typeof Float16Array<"u"&&d instanceof Float16Array)v=e.HALF_FLOAT;else if(d instanceof Uint16Array)c.isFloat16BufferAttribute?v=e.HALF_FLOAT:v=e.UNSIGNED_SHORT;else if(d instanceof Int16Array)v=e.SHORT;else if(d instanceof Uint32Array)v=e.UNSIGNED_INT;else if(d instanceof Int32Array)v=e.INT;else if(d instanceof Int8Array)v=e.BYTE;else if(d instanceof Uint8Array)v=e.UNSIGNED_BYTE;else if(d instanceof Uint8ClampedArray)v=e.UNSIGNED_BYTE;else throw new Error("THREE.WebGLAttributes: Unsupported buffer data format: "+d);return{buffer:p,type:v,bytesPerElement:d.BYTES_PER_ELEMENT,version:c.version,size:g}}function i(c,l,d){const _=l.array,g=l.updateRanges;if(e.bindBuffer(d,c),g.length===0)e.bufferSubData(d,0,_);else{g.sort((v,A)=>v.start-A.start);let p=0;for(let v=1;v<g.length;v++){const A=g[p],U=g[v];U.start<=A.start+A.count+1?A.count=Math.max(A.count,U.start+U.count-A.start):(++p,g[p]=U)}g.length=p+1;for(let v=0,A=g.length;v<A;v++){const U=g[v];e.bufferSubData(d,U.start*_.BYTES_PER_ELEMENT,_,U.start,U.count)}l.clearUpdateRanges()}l.onUploadCallback()}function a(c){return c.isInterleavedBufferAttribute&&(c=c.data),n.get(c)}function r(c){c.isInterleavedBufferAttribute&&(c=c.data);const l=n.get(c);l&&(e.deleteBuffer(l.buffer),n.delete(c))}function o(c,l){if(c.isInterleavedBufferAttribute&&(c=c.data),c.isGLBufferAttribute){const _=n.get(c);(!_||_.version<c.version)&&n.set(c,{buffer:c.buffer,type:c.type,bytesPerElement:c.elementSize,version:c.version});return}const d=n.get(c);if(d===void 0)n.set(c,t(c,l));else if(d.version<c.version){if(d.size!==c.array.byteLength)throw new Error("THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.");i(d.buffer,c,l),d.version=c.version}}return{get:a,remove:r,update:o}}var Us=`#ifdef USE_ALPHAHASH
	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif`,Ds=`#ifdef USE_ALPHAHASH
	const float ALPHA_HASH_SCALE = 0.05;
	float hash2D( vec2 value ) {
		return fract( 1.0e4 * sin( 17.0 * value.x + 0.1 * value.y ) * ( 0.1 + abs( sin( 13.0 * value.y + value.x ) ) ) );
	}
	float hash3D( vec3 value ) {
		return hash2D( vec2( hash2D( value.xy ), value.z ) );
	}
	float getAlphaHashThreshold( vec3 position ) {
		float maxDeriv = max(
			length( dFdx( position.xyz ) ),
			length( dFdy( position.xyz ) )
		);
		float pixScale = 1.0 / ( ALPHA_HASH_SCALE * maxDeriv );
		vec2 pixScales = vec2(
			exp2( floor( log2( pixScale ) ) ),
			exp2( ceil( log2( pixScale ) ) )
		);
		vec2 alpha = vec2(
			hash3D( floor( pixScales.x * position.xyz ) ),
			hash3D( floor( pixScales.y * position.xyz ) )
		);
		float lerpFactor = fract( log2( pixScale ) );
		float x = ( 1.0 - lerpFactor ) * alpha.x + lerpFactor * alpha.y;
		float a = min( lerpFactor, 1.0 - lerpFactor );
		vec3 cases = vec3(
			x * x / ( 2.0 * a * ( 1.0 - a ) ),
			( x - 0.5 * a ) / ( 1.0 - a ),
			1.0 - ( ( 1.0 - x ) * ( 1.0 - x ) / ( 2.0 * a * ( 1.0 - a ) ) )
		);
		float threshold = ( x < ( 1.0 - a ) )
			? ( ( x < a ) ? cases.x : cases.y )
			: cases.z;
		return clamp( threshold , 1.0e-6, 1.0 );
	}
#endif`,Is=`#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif`,Ns=`#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,ys=`#ifdef USE_ALPHATEST
	#ifdef ALPHA_TO_COVERAGE
	diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );
	if ( diffuseColor.a == 0.0 ) discard;
	#else
	if ( diffuseColor.a < alphaTest ) discard;
	#endif
#endif`,Os=`#ifdef USE_ALPHATEST
	uniform float alphaTest;
#endif`,Fs=`#ifdef USE_AOMAP
	float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;
	reflectedLight.indirectDiffuse *= ambientOcclusion;
	#if defined( USE_CLEARCOAT ) 
		clearcoatSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_SHEEN ) 
		sheenSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD )
		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
		reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
	#endif
#endif`,Bs=`#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif`,Gs=`#ifdef USE_BATCHING
	#if ! defined( GL_ANGLE_multi_draw )
	#define gl_DrawID _gl_DrawID
	uniform int _gl_DrawID;
	#endif
	uniform highp sampler2D batchingTexture;
	uniform highp usampler2D batchingIdTexture;
	mat4 getBatchingMatrix( const in float i ) {
		int size = textureSize( batchingTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( batchingTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( batchingTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( batchingTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( batchingTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
	float getIndirectIndex( const in int i ) {
		int size = textureSize( batchingIdTexture, 0 ).x;
		int x = i % size;
		int y = i / size;
		return float( texelFetch( batchingIdTexture, ivec2( x, y ), 0 ).r );
	}
#endif
#ifdef USE_BATCHING_COLOR
	uniform sampler2D batchingColorTexture;
	vec4 getBatchingColor( const in float i ) {
		int size = textureSize( batchingColorTexture, 0 ).x;
		int j = int( i );
		int x = j % size;
		int y = j / size;
		return texelFetch( batchingColorTexture, ivec2( x, y ), 0 );
	}
#endif`,Hs=`#ifdef USE_BATCHING
	mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );
#endif`,Vs=`vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif`,ks=`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif`,Ws=`float G_BlinnPhong_Implicit( ) {
	return 0.25;
}
float D_BlinnPhong( const in float shininess, const in float dotNH ) {
	return RECIPROCAL_PI * ( shininess * 0.5 + 1.0 ) * pow( dotNH, shininess );
}
vec3 BRDF_BlinnPhong( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 specularColor, const in float shininess ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( specularColor, 1.0, dotVH );
	float G = G_BlinnPhong_Implicit( );
	float D = D_BlinnPhong( shininess, dotNH );
	return F * ( G * D );
} // validated`,zs=`#ifdef USE_IRIDESCENCE
	const mat3 XYZ_TO_REC709 = mat3(
		 3.2404542, -0.9692660,  0.0556434,
		-1.5371385,  1.8760108, -0.2040259,
		-0.4985314,  0.0415560,  1.0572252
	);
	vec3 Fresnel0ToIor( vec3 fresnel0 ) {
		vec3 sqrtF0 = sqrt( fresnel0 );
		return ( vec3( 1.0 ) + sqrtF0 ) / ( vec3( 1.0 ) - sqrtF0 );
	}
	vec3 IorToFresnel0( vec3 transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - vec3( incidentIor ) ) / ( transmittedIor + vec3( incidentIor ) ) );
	}
	float IorToFresnel0( float transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - incidentIor ) / ( transmittedIor + incidentIor ));
	}
	vec3 evalSensitivity( float OPD, vec3 shift ) {
		float phase = 2.0 * PI * OPD * 1.0e-9;
		vec3 val = vec3( 5.4856e-13, 4.4201e-13, 5.2481e-13 );
		vec3 pos = vec3( 1.6810e+06, 1.7953e+06, 2.2084e+06 );
		vec3 var = vec3( 4.3278e+09, 9.3046e+09, 6.6121e+09 );
		vec3 xyz = val * sqrt( 2.0 * PI * var ) * cos( pos * phase + shift ) * exp( - pow2( phase ) * var );
		xyz.x += 9.7470e-14 * sqrt( 2.0 * PI * 4.5282e+09 ) * cos( 2.2399e+06 * phase + shift[ 0 ] ) * exp( - 4.5282e+09 * pow2( phase ) );
		xyz /= 1.0685e-7;
		vec3 rgb = XYZ_TO_REC709 * xyz;
		return rgb;
	}
	vec3 evalIridescence( float outsideIOR, float eta2, float cosTheta1, float thinFilmThickness, vec3 baseF0 ) {
		vec3 I;
		float iridescenceIOR = mix( outsideIOR, eta2, smoothstep( 0.0, 0.03, thinFilmThickness ) );
		float sinTheta2Sq = pow2( outsideIOR / iridescenceIOR ) * ( 1.0 - pow2( cosTheta1 ) );
		float cosTheta2Sq = 1.0 - sinTheta2Sq;
		if ( cosTheta2Sq < 0.0 ) {
			return vec3( 1.0 );
		}
		float cosTheta2 = sqrt( cosTheta2Sq );
		float R0 = IorToFresnel0( iridescenceIOR, outsideIOR );
		float R12 = F_Schlick( R0, 1.0, cosTheta1 );
		float T121 = 1.0 - R12;
		float phi12 = 0.0;
		if ( iridescenceIOR < outsideIOR ) phi12 = PI;
		float phi21 = PI - phi12;
		vec3 baseIOR = Fresnel0ToIor( clamp( baseF0, 0.0, 0.9999 ) );		vec3 R1 = IorToFresnel0( baseIOR, iridescenceIOR );
		vec3 R23 = F_Schlick( R1, 1.0, cosTheta2 );
		vec3 phi23 = vec3( 0.0 );
		if ( baseIOR[ 0 ] < iridescenceIOR ) phi23[ 0 ] = PI;
		if ( baseIOR[ 1 ] < iridescenceIOR ) phi23[ 1 ] = PI;
		if ( baseIOR[ 2 ] < iridescenceIOR ) phi23[ 2 ] = PI;
		float OPD = 2.0 * iridescenceIOR * thinFilmThickness * cosTheta2;
		vec3 phi = vec3( phi21 ) + phi23;
		vec3 R123 = clamp( R12 * R23, 1e-5, 0.9999 );
		vec3 r123 = sqrt( R123 );
		vec3 Rs = pow2( T121 ) * R23 / ( vec3( 1.0 ) - R123 );
		vec3 C0 = R12 + Rs;
		I = C0;
		vec3 Cm = Rs - T121;
		for ( int m = 1; m <= 2; ++ m ) {
			Cm *= r123;
			vec3 Sm = 2.0 * evalSensitivity( float( m ) * OPD, float( m ) * phi );
			I += Cm * Sm;
		}
		return max( I, vec3( 0.0 ) );
	}
#endif`,Xs=`#ifdef USE_BUMPMAP
	uniform sampler2D bumpMap;
	uniform float bumpScale;
	vec2 dHdxy_fwd() {
		vec2 dSTdx = dFdx( vBumpMapUv );
		vec2 dSTdy = dFdy( vBumpMapUv );
		float Hll = bumpScale * texture2D( bumpMap, vBumpMapUv ).x;
		float dBx = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdx ).x - Hll;
		float dBy = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdy ).x - Hll;
		return vec2( dBx, dBy );
	}
	vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {
		vec3 vSigmaX = normalize( dFdx( surf_pos.xyz ) );
		vec3 vSigmaY = normalize( dFdy( surf_pos.xyz ) );
		vec3 vN = surf_norm;
		vec3 R1 = cross( vSigmaY, vN );
		vec3 R2 = cross( vN, vSigmaX );
		float fDet = dot( vSigmaX, R1 ) * faceDirection;
		vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
		return normalize( abs( fDet ) * surf_norm - vGrad );
	}
#endif`,Ks=`#if NUM_CLIPPING_PLANES > 0
	vec4 plane;
	#ifdef ALPHA_TO_COVERAGE
		float distanceToPlane, distanceGradient;
		float clipOpacity = 1.0;
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
			distanceGradient = fwidth( distanceToPlane ) / 2.0;
			clipOpacity *= smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			if ( clipOpacity == 0.0 ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			float unionClipOpacity = 1.0;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
				distanceGradient = fwidth( distanceToPlane ) / 2.0;
				unionClipOpacity *= 1.0 - smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			}
			#pragma unroll_loop_end
			clipOpacity *= 1.0 - unionClipOpacity;
		#endif
		diffuseColor.a *= clipOpacity;
		if ( diffuseColor.a == 0.0 ) discard;
	#else
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			if ( dot( vClipPosition, plane.xyz ) > plane.w ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			bool clipped = true;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				clipped = ( dot( vClipPosition, plane.xyz ) > plane.w ) && clipped;
			}
			#pragma unroll_loop_end
			if ( clipped ) discard;
		#endif
	#endif
#endif`,Ys=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`,qs=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif`,Zs=`#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif`,$s=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#endif`,js=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#endif`,Qs=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	varying vec4 vColor;
#endif`,Js=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	vColor = vec4( 1.0 );
#endif
#ifdef USE_COLOR_ALPHA
	vColor *= color;
#elif defined( USE_COLOR )
	vColor.rgb *= color;
#endif
#ifdef USE_INSTANCING_COLOR
	vColor.rgb *= instanceColor.rgb;
#endif
#ifdef USE_BATCHING_COLOR
	vColor *= getBatchingColor( getIndirectIndex( gl_DrawID ) );
#endif`,ec=`#define PI 3.141592653589793
#define PI2 6.283185307179586
#define PI_HALF 1.5707963267948966
#define RECIPROCAL_PI 0.3183098861837907
#define RECIPROCAL_PI2 0.15915494309189535
#define EPSILON 1e-6
#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
#define whiteComplement( a ) ( 1.0 - saturate( a ) )
float pow2( const in float x ) { return x*x; }
vec3 pow2( const in vec3 x ) { return x*x; }
float pow3( const in float x ) { return x*x*x; }
float pow4( const in float x ) { float x2 = x*x; return x2*x2; }
float max3( const in vec3 v ) { return max( max( v.x, v.y ), v.z ); }
float average( const in vec3 v ) { return dot( v, vec3( 0.3333333 ) ); }
highp float rand( const in vec2 uv ) {
	const highp float a = 12.9898, b = 78.233, c = 43758.5453;
	highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );
	return fract( sin( sn ) * c );
}
#ifdef HIGH_PRECISION
	float precisionSafeLength( vec3 v ) { return length( v ); }
#else
	float precisionSafeLength( vec3 v ) {
		float maxComponent = max3( abs( v ) );
		return length( v / maxComponent ) * maxComponent;
	}
#endif
struct IncidentLight {
	vec3 color;
	vec3 direction;
	bool visible;
};
struct ReflectedLight {
	vec3 directDiffuse;
	vec3 directSpecular;
	vec3 indirectDiffuse;
	vec3 indirectSpecular;
};
#ifdef USE_ALPHAHASH
	varying vec3 vPosition;
#endif
vec3 transformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );
}
#define inverseTransformDirection transformDirectionByInverseViewMatrix
vec3 transformNormalByInverseViewMatrix( in vec3 normal, in mat4 viewMatrix ) {
	return normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
}
vec3 transformDirectionByInverseViewMatrix( in vec3 dir, in mat4 viewMatrix ) {
	return normalize( ( vec4( dir, 0.0 ) * viewMatrix ).xyz );
}
bool isPerspectiveMatrix( mat4 m ) {
	return m[ 2 ][ 3 ] == - 1.0;
}
vec2 equirectUv( in vec3 dir ) {
	float u = atan( dir.z, dir.x ) * RECIPROCAL_PI2 + 0.5;
	float v = asin( clamp( dir.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5;
	return vec2( u, v );
}
vec3 BRDF_Lambert( const in vec3 diffuseColor ) {
	return RECIPROCAL_PI * diffuseColor;
}
vec3 F_Schlick( const in vec3 f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
}
float F_Schlick( const in float f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
} // validated`,tc=`#ifdef ENVMAP_TYPE_CUBE_UV
	#define cubeUV_minMipLevel 4.0
	#define cubeUV_minTileSize 16.0
	float getFace( vec3 direction ) {
		vec3 absDirection = abs( direction );
		float face = - 1.0;
		if ( absDirection.x > absDirection.z ) {
			if ( absDirection.x > absDirection.y )
				face = direction.x > 0.0 ? 0.0 : 3.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		} else {
			if ( absDirection.z > absDirection.y )
				face = direction.z > 0.0 ? 2.0 : 5.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		}
		return face;
	}
	vec2 getUV( vec3 direction, float face ) {
		vec2 uv;
		if ( face == 0.0 ) {
			uv = vec2( direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 1.0 ) {
			uv = vec2( - direction.x, - direction.z ) / abs( direction.y );
		} else if ( face == 2.0 ) {
			uv = vec2( - direction.x, direction.y ) / abs( direction.z );
		} else if ( face == 3.0 ) {
			uv = vec2( - direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 4.0 ) {
			uv = vec2( - direction.x, direction.z ) / abs( direction.y );
		} else {
			uv = vec2( direction.x, direction.y ) / abs( direction.z );
		}
		return 0.5 * ( uv + 1.0 );
	}
	vec3 bilinearCubeUV( sampler2D envMap, vec3 direction, float mipInt ) {
		float face = getFace( direction );
		float filterInt = max( cubeUV_minMipLevel - mipInt, 0.0 );
		mipInt = max( mipInt, cubeUV_minMipLevel );
		float faceSize = exp2( mipInt );
		highp vec2 uv = getUV( direction, face ) * ( faceSize - 2.0 ) + 1.0;
		if ( face > 2.0 ) {
			uv.y += faceSize;
			face -= 3.0;
		}
		uv.x += face * faceSize;
		uv.x += filterInt * 3.0 * cubeUV_minTileSize;
		uv.y += 4.0 * ( exp2( CUBEUV_MAX_MIP ) - faceSize );
		uv.x *= CUBEUV_TEXEL_WIDTH;
		uv.y *= CUBEUV_TEXEL_HEIGHT;
		#ifdef texture2DGradEXT
			return texture2DGradEXT( envMap, uv, vec2( 0.0 ), vec2( 0.0 ) ).rgb;
		#else
			return texture2D( envMap, uv ).rgb;
		#endif
	}
	#define cubeUV_r0 1.0
	#define cubeUV_m0 - 2.0
	#define cubeUV_r1 0.8
	#define cubeUV_m1 - 1.0
	#define cubeUV_r4 0.4
	#define cubeUV_m4 2.0
	#define cubeUV_r5 0.305
	#define cubeUV_m5 3.0
	#define cubeUV_r6 0.21
	#define cubeUV_m6 4.0
	float roughnessToMip( float roughness ) {
		float mip = 0.0;
		if ( roughness >= cubeUV_r1 ) {
			mip = ( cubeUV_r0 - roughness ) * ( cubeUV_m1 - cubeUV_m0 ) / ( cubeUV_r0 - cubeUV_r1 ) + cubeUV_m0;
		} else if ( roughness >= cubeUV_r4 ) {
			mip = ( cubeUV_r1 - roughness ) * ( cubeUV_m4 - cubeUV_m1 ) / ( cubeUV_r1 - cubeUV_r4 ) + cubeUV_m1;
		} else if ( roughness >= cubeUV_r5 ) {
			mip = ( cubeUV_r4 - roughness ) * ( cubeUV_m5 - cubeUV_m4 ) / ( cubeUV_r4 - cubeUV_r5 ) + cubeUV_m4;
		} else if ( roughness >= cubeUV_r6 ) {
			mip = ( cubeUV_r5 - roughness ) * ( cubeUV_m6 - cubeUV_m5 ) / ( cubeUV_r5 - cubeUV_r6 ) + cubeUV_m5;
		} else {
			mip = - 2.0 * log2( 1.16 * roughness );		}
		return mip;
	}
	vec4 textureCubeUV( sampler2D envMap, vec3 sampleDir, float roughness ) {
		float mip = clamp( roughnessToMip( roughness ), cubeUV_m0, CUBEUV_MAX_MIP );
		float mipF = fract( mip );
		float mipInt = floor( mip );
		vec3 color0 = bilinearCubeUV( envMap, sampleDir, mipInt );
		if ( mipF == 0.0 ) {
			return vec4( color0, 1.0 );
		} else {
			vec3 color1 = bilinearCubeUV( envMap, sampleDir, mipInt + 1.0 );
			return vec4( mix( color0, color1, mipF ), 1.0 );
		}
	}
#endif`,nc=`vec3 transformedNormal = objectNormal;
#ifdef USE_TANGENT
	vec3 transformedTangent = objectTangent;
#endif
#ifdef USE_BATCHING
	mat3 bm = mat3( batchingMatrix );
	transformedNormal /= vec3( dot( bm[ 0 ], bm[ 0 ] ), dot( bm[ 1 ], bm[ 1 ] ), dot( bm[ 2 ], bm[ 2 ] ) );
	transformedNormal = bm * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = bm * transformedTangent;
	#endif
#endif
#ifdef USE_INSTANCING
	mat3 im = mat3( instanceMatrix );
	transformedNormal /= vec3( dot( im[ 0 ], im[ 0 ] ), dot( im[ 1 ], im[ 1 ] ), dot( im[ 2 ], im[ 2 ] ) );
	transformedNormal = im * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = im * transformedTangent;
	#endif
#endif
transformedNormal = normalMatrix * transformedNormal;
#ifdef FLIP_SIDED
	transformedNormal = - transformedNormal;
#endif
#ifdef USE_TANGENT
	transformedTangent = ( modelViewMatrix * vec4( transformedTangent, 0.0 ) ).xyz;
#endif`,ic=`#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif`,rc=`#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif`,ac=`#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	#ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
		emissiveColor = sRGBTransferEOTF( emissiveColor );
	#endif
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,oc=`#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif`,sc="gl_FragColor = linearToOutputTexel( gl_FragColor );",cc=`vec4 LinearTransferOETF( in vec4 value ) {
	return value;
}
vec4 sRGBTransferEOTF( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}
vec4 sRGBTransferOETF( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}`,lc=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vec3 cameraToFrag;
		if ( isOrthographic ) {
			cameraToFrag = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToFrag = normalize( vWorldPosition - cameraPosition );
		}
		vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vec3 reflectVec = reflect( cameraToFrag, worldNormal );
		#else
			vec3 reflectVec = refract( cameraToFrag, worldNormal, refractionRatio );
		#endif
	#else
		vec3 reflectVec = vReflect;
	#endif
	#ifdef ENVMAP_TYPE_CUBE
		vec4 envColor = textureCube( envMap, envMapRotation * reflectVec );
		#ifdef ENVMAP_BLENDING_MULTIPLY
			outgoingLight = mix( outgoingLight, outgoingLight * envColor.xyz, specularStrength * reflectivity );
		#elif defined( ENVMAP_BLENDING_MIX )
			outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );
		#elif defined( ENVMAP_BLENDING_ADD )
			outgoingLight += envColor.xyz * specularStrength * reflectivity;
		#endif
	#endif
#endif`,fc=`#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform mat3 envMapRotation;
	#ifdef ENVMAP_TYPE_CUBE
		uniform samplerCube envMap;
	#else
		uniform sampler2D envMap;
	#endif
#endif`,uc=`#ifdef USE_ENVMAP
	uniform float reflectivity;
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		varying vec3 vWorldPosition;
		uniform float refractionRatio;
	#else
		varying vec3 vReflect;
	#endif
#endif`,dc=`#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif`,pc=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vWorldPosition = worldPosition.xyz;
	#else
		vec3 cameraToVertex;
		if ( isOrthographic ) {
			cameraToVertex = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToVertex = normalize( worldPosition.xyz - cameraPosition );
		}
		vec3 worldNormal = transformNormalByInverseViewMatrix( transformedNormal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vReflect = reflect( cameraToVertex, worldNormal );
		#else
			vReflect = refract( cameraToVertex, worldNormal, refractionRatio );
		#endif
	#endif
#endif`,hc=`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
#endif`,mc=`#ifdef USE_FOG
	varying float vFogDepth;
#endif`,_c=`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,gc=`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,vc=`#ifdef USE_GRADIENTMAP
	uniform sampler2D gradientMap;
#endif
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
	float dotNL = dot( normal, lightDirection );
	vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.0 );
	#ifdef USE_GRADIENTMAP
		return vec3( texture2D( gradientMap, coord ).r );
	#else
		vec2 fw = fwidth( coord ) * 0.5;
		return mix( vec3( 0.7 ), vec3( 1.0 ), smoothstep( 0.7 - fw.x, 0.7 + fw.x, coord.x ) );
	#endif
}`,Sc=`#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif`,Ec=`LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;`,xc=`varying vec3 vViewPosition;
struct LambertMaterial {
	vec3 diffuseColor;
	float specularStrength;
};
void RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Lambert
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert`,Mc=`uniform bool receiveShadow;
uniform vec3 ambientLightColor;
#if defined( USE_LIGHT_PROBES )
	uniform vec3 lightProbe[ 9 ];
#endif
vec3 shGetIrradianceAt( in vec3 normal, in vec3 shCoefficients[ 9 ] ) {
	float x = normal.x, y = normal.y, z = normal.z;
	vec3 result = shCoefficients[ 0 ] * 0.886227;
	result += shCoefficients[ 1 ] * 2.0 * 0.511664 * y;
	result += shCoefficients[ 2 ] * 2.0 * 0.511664 * z;
	result += shCoefficients[ 3 ] * 2.0 * 0.511664 * x;
	result += shCoefficients[ 4 ] * 2.0 * 0.429043 * x * y;
	result += shCoefficients[ 5 ] * 2.0 * 0.429043 * y * z;
	result += shCoefficients[ 6 ] * ( 0.743125 * z * z - 0.247708 );
	result += shCoefficients[ 7 ] * 2.0 * 0.429043 * x * z;
	result += shCoefficients[ 8 ] * 0.429043 * ( x * x - y * y );
	return result;
}
vec3 getLightProbeIrradiance( const in vec3 lightProbe[ 9 ], const in vec3 normal ) {
	vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
	vec3 irradiance = shGetIrradianceAt( worldNormal, lightProbe );
	return irradiance;
}
vec3 getAmbientLightIrradiance( const in vec3 ambientLightColor ) {
	vec3 irradiance = ambientLightColor;
	return irradiance;
}
float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {
	float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );
	if ( cutoffDistance > 0.0 ) {
		distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );
	}
	return distanceFalloff;
}
float getSpotAttenuation( const in float coneCosine, const in float penumbraCosine, const in float angleCosine ) {
	return smoothstep( coneCosine, penumbraCosine, angleCosine );
}
#if NUM_SUN_LIGHTS > 0
	struct SunLight {
		vec3 direction;
		vec3 color;
	};
	uniform SunLight sunLights[ NUM_SUN_LIGHTS ];
	void getSunLightInfo( const in SunLight sunLight, out IncidentLight light ) {
		light.color = sunLight.color;
		light.direction = sunLight.direction;
		light.visible = true;
	}
#endif
#if NUM_DIR_LIGHTS > 0
	struct DirectionalLight {
		vec3 direction;
		vec3 color;
	};
	uniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];
	void getDirectionalLightInfo( const in DirectionalLight directionalLight, out IncidentLight light ) {
		light.color = directionalLight.color;
		light.direction = directionalLight.direction;
		light.visible = true;
	}
#endif
#if NUM_POINT_LIGHTS > 0
	struct PointLight {
		vec3 position;
		vec3 color;
		float distance;
		float decay;
	};
	uniform PointLight pointLights[ NUM_POINT_LIGHTS ];
	void getPointLightInfo( const in PointLight pointLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = pointLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float lightDistance = length( lVector );
		light.color = pointLight.color;
		light.color *= getDistanceAttenuation( lightDistance, pointLight.distance, pointLight.decay );
		light.visible = ( light.color != vec3( 0.0 ) );
	}
#endif
#if NUM_SPOT_LIGHTS > 0
	struct SpotLight {
		vec3 position;
		vec3 direction;
		vec3 color;
		float distance;
		float decay;
		float coneCos;
		float penumbraCos;
	};
	uniform SpotLight spotLights[ NUM_SPOT_LIGHTS ];
	void getSpotLightInfo( const in SpotLight spotLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = spotLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float angleCos = dot( light.direction, spotLight.direction );
		float spotAttenuation = getSpotAttenuation( spotLight.coneCos, spotLight.penumbraCos, angleCos );
		if ( spotAttenuation > 0.0 ) {
			float lightDistance = length( lVector );
			light.color = spotLight.color * spotAttenuation;
			light.color *= getDistanceAttenuation( lightDistance, spotLight.distance, spotLight.decay );
			light.visible = ( light.color != vec3( 0.0 ) );
		} else {
			light.color = vec3( 0.0 );
			light.visible = false;
		}
	}
#endif
#if NUM_RECT_AREA_LIGHTS > 0
	struct RectAreaLight {
		vec3 color;
		vec3 position;
		vec3 halfWidth;
		vec3 halfHeight;
	};
	uniform sampler2D ltc_1;	uniform sampler2D ltc_2;
	uniform RectAreaLight rectAreaLights[ NUM_RECT_AREA_LIGHTS ];
#endif
#if NUM_HEMI_LIGHTS > 0
	struct HemisphereLight {
		vec3 direction;
		vec3 skyColor;
		vec3 groundColor;
	};
	uniform HemisphereLight hemisphereLights[ NUM_HEMI_LIGHTS ];
	vec3 getHemisphereLightIrradiance( const in HemisphereLight hemiLight, const in vec3 normal ) {
		float dotNL = dot( normal, hemiLight.direction );
		float hemiDiffuseWeight = 0.5 * dotNL + 0.5;
		vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );
		return irradiance;
	}
#endif
#include <lightprobes_pars_fragment>`,Tc=`#ifdef USE_ENVMAP
	vec3 getIBLIrradiance( const in vec3 normal ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 );
			return PI * envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 reflectVec = reflect( - viewDir, normal );
			reflectVec = normalize( mix( reflectVec, normal, pow4( roughness ) ) );
			reflectVec = transformDirectionByInverseViewMatrix( reflectVec, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );
			return envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	#ifdef USE_RETROREFLECTION
		vec3 getIBLRetroRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
			#ifdef ENVMAP_TYPE_CUBE_UV
				vec3 retroVec = normalize( mix( viewDir, normal, pow4( roughness ) ) );
				retroVec = transformDirectionByInverseViewMatrix( retroVec, viewMatrix );
				vec4 envMapColor = textureCubeUV( envMap, envMapRotation * retroVec, roughness );
				return envMapColor.rgb * envMapIntensity;
			#else
				return vec3( 0.0 );
			#endif
		}
	#endif
	#ifdef USE_ANISOTROPY
		vec3 getIBLAnisotropyRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
			#ifdef ENVMAP_TYPE_CUBE_UV
				vec3 bentNormal = cross( bitangent, viewDir );
				bentNormal = normalize( cross( bentNormal, bitangent ) );
				bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
				return getIBLRadiance( viewDir, bentNormal, roughness );
			#else
				return vec3( 0.0 );
			#endif
		}
		#ifdef USE_RETROREFLECTION
			vec3 getIBLAnisotropyRetroRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
				#ifdef ENVMAP_TYPE_CUBE_UV
					vec3 bentNormal = cross( bitangent, viewDir );
					bentNormal = normalize( cross( bentNormal, bitangent ) );
					bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
					return getIBLRetroRadiance( viewDir, bentNormal, roughness );
				#else
					return vec3( 0.0 );
				#endif
			}
		#endif
	#endif
#endif`,Ac=`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;`,Rc=`varying vec3 vViewPosition;
struct ToonMaterial {
	vec3 diffuseColor;
};
void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Toon
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon`,bc=`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;`,Cc=`varying vec3 vViewPosition;
struct BlinnPhongMaterial {
	vec3 diffuseColor;
	vec3 specularColor;
	float specularShininess;
	float specularStrength;
};
void RE_Direct_BlinnPhong( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
	reflectedLight.directSpecular += irradiance * BRDF_BlinnPhong( directLight.direction, geometryViewDir, geometryNormal, material.specularColor, material.specularShininess ) * material.specularStrength;
}
void RE_IndirectDiffuse_BlinnPhong( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_BlinnPhong
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong`,Lc=`PhysicalMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.diffuseContribution = diffuseColor.rgb * ( 1.0 - metalnessFactor );
material.metalness = metalnessFactor;
vec3 dxy = max( abs( dFdx( nonPerturbedNormal ) ), abs( dFdy( nonPerturbedNormal ) ) );
float geometryRoughness = max( max( dxy.x, dxy.y ), dxy.z );
material.roughness = max( roughnessFactor, 0.0525 );material.roughness += geometryRoughness;
material.roughness = min( material.roughness, 1.0 );
#ifdef IOR
	material.ior = ior;
	#ifdef USE_SPECULAR
		float specularIntensityFactor = specularIntensity;
		vec3 specularColorFactor = specularColor;
		#ifdef USE_SPECULAR_COLORMAP
			specularColorFactor *= texture2D( specularColorMap, vSpecularColorMapUv ).rgb;
		#endif
		#ifdef USE_SPECULAR_INTENSITYMAP
			specularIntensityFactor *= texture2D( specularIntensityMap, vSpecularIntensityMapUv ).a;
		#endif
		material.specularF90 = mix( specularIntensityFactor, 1.0, metalnessFactor );
	#else
		float specularIntensityFactor = 1.0;
		vec3 specularColorFactor = vec3( 1.0 );
		material.specularF90 = 1.0;
	#endif
	material.specularColor = min( pow2( ( material.ior - 1.0 ) / ( material.ior + 1.0 ) ) * specularColorFactor, vec3( 1.0 ) ) * specularIntensityFactor;
	material.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );
#else
	material.specularColor = vec3( 0.04 );
	material.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );
	material.specularF90 = 1.0;
#endif
#ifdef USE_CLEARCOAT
	material.clearcoat = clearcoat;
	material.clearcoatRoughness = clearcoatRoughness;
	material.clearcoatF0 = vec3( 0.04 );
	material.clearcoatF90 = 1.0;
	#ifdef USE_CLEARCOATMAP
		material.clearcoat *= texture2D( clearcoatMap, vClearcoatMapUv ).x;
	#endif
	#ifdef USE_CLEARCOAT_ROUGHNESSMAP
		material.clearcoatRoughness *= texture2D( clearcoatRoughnessMap, vClearcoatRoughnessMapUv ).y;
	#endif
	material.clearcoat = saturate( material.clearcoat );	material.clearcoatRoughness = max( material.clearcoatRoughness, 0.0525 );
	material.clearcoatRoughness += geometryRoughness;
	material.clearcoatRoughness = min( material.clearcoatRoughness, 1.0 );
#endif
#ifdef USE_DISPERSION
	material.dispersion = dispersion;
#endif
#ifdef USE_RETROREFLECTION
	material.retroreflectivity = retroreflectivity;
#endif
#ifdef USE_IRIDESCENCE
	material.iridescence = iridescence;
	material.iridescenceIOR = iridescenceIOR;
	#ifdef USE_IRIDESCENCEMAP
		material.iridescence *= texture2D( iridescenceMap, vIridescenceMapUv ).r;
	#endif
	#ifdef USE_IRIDESCENCE_THICKNESSMAP
		material.iridescenceThickness = (iridescenceThicknessMaximum - iridescenceThicknessMinimum) * texture2D( iridescenceThicknessMap, vIridescenceThicknessMapUv ).g + iridescenceThicknessMinimum;
	#else
		material.iridescenceThickness = iridescenceThicknessMaximum;
	#endif
#endif
#ifdef USE_SHEEN
	material.sheenColor = sheenColor;
	#ifdef USE_SHEEN_COLORMAP
		material.sheenColor *= texture2D( sheenColorMap, vSheenColorMapUv ).rgb;
	#endif
	material.sheenRoughness = clamp( sheenRoughness, 0.0001, 1.0 );
	#ifdef USE_SHEEN_ROUGHNESSMAP
		material.sheenRoughness *= texture2D( sheenRoughnessMap, vSheenRoughnessMapUv ).a;
	#endif
#endif
#ifdef USE_ANISOTROPY
	#ifdef USE_ANISOTROPYMAP
		mat2 anisotropyMat = mat2( anisotropyVector.x, anisotropyVector.y, - anisotropyVector.y, anisotropyVector.x );
		vec3 anisotropyPolar = texture2D( anisotropyMap, vAnisotropyMapUv ).rgb;
		vec2 anisotropyV = anisotropyMat * normalize( 2.0 * anisotropyPolar.rg - vec2( 1.0 ) ) * anisotropyPolar.b;
	#else
		vec2 anisotropyV = anisotropyVector;
	#endif
	material.anisotropy = length( anisotropyV );
	if( material.anisotropy == 0.0 ) {
		anisotropyV = vec2( 1.0, 0.0 );
	} else {
		anisotropyV /= material.anisotropy;
		material.anisotropy = saturate( material.anisotropy );
	}
	material.alphaT = mix( pow2( material.roughness ), 1.0, pow2( material.anisotropy ) );
	material.anisotropyT = tbn[ 0 ] * anisotropyV.x + tbn[ 1 ] * anisotropyV.y;
	material.anisotropyB = tbn[ 1 ] * anisotropyV.x - tbn[ 0 ] * anisotropyV.y;
#endif`,Pc=`uniform sampler2D dfgLUT;
struct PhysicalMaterial {
	vec3 diffuseColor;
	vec3 diffuseContribution;
	vec3 specularColor;
	vec3 specularColorBlended;
	float roughness;
	float metalness;
	float specularF90;
	float dispersion;
	vec2 dfg;
	vec3 multiScatteringCompensation;
	#ifdef USE_RETROREFLECTION
		float retroreflectivity;
	#endif
	#ifdef USE_CLEARCOAT
		float clearcoat;
		float clearcoatRoughness;
		vec3 clearcoatF0;
		float clearcoatF90;
	#endif
	#ifdef USE_IRIDESCENCE
		float iridescence;
		float iridescenceIOR;
		float iridescenceThickness;
		vec3 iridescenceFresnel;
		vec3 iridescenceF0Dielectric;
		vec3 iridescenceF0Metallic;
	#endif
	#ifdef USE_SHEEN
		vec3 sheenColor;
		float sheenRoughness;
	#endif
	#ifdef IOR
		float ior;
	#endif
	#ifdef USE_TRANSMISSION
		float transmission;
		float transmissionAlpha;
		float thickness;
		float attenuationDistance;
		vec3 attenuationColor;
	#endif
	#ifdef USE_ANISOTROPY
		float anisotropy;
		float alphaT;
		vec3 anisotropyT;
		vec3 anisotropyB;
	#endif
};
vec3 clearcoatSpecularDirect = vec3( 0.0 );
vec3 clearcoatSpecularIndirect = vec3( 0.0 );
vec3 sheenSpecularDirect = vec3( 0.0 );
vec3 sheenSpecularIndirect = vec3(0.0 );
vec3 Schlick_to_F0( const in vec3 f, const in float f90, const in float dotVH ) {
    float x = clamp( 1.0 - dotVH, 0.0, 1.0 );
    float x2 = x * x;
    float x5 = clamp( x * x2 * x2, 0.0, 0.9999 );
    return ( f - vec3( f90 ) * x5 ) / ( 1.0 - x5 );
}
float V_GGX_SmithCorrelated( const in float alpha, const in float dotNL, const in float dotNV ) {
	float a2 = pow2( alpha );
	float gv = dotNL * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNV ) );
	float gl = dotNV * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNL ) );
	return 0.5 / max( gv + gl, EPSILON );
}
float D_GGX( const in float alpha, const in float dotNH ) {
	float a2 = pow2( alpha );
	float denom = pow2( dotNH ) * ( a2 - 1.0 ) + 1.0;
	return RECIPROCAL_PI * a2 / pow2( denom );
}
#ifdef USE_ANISOTROPY
	float V_GGX_SmithCorrelated_Anisotropic( const in float alphaT, const in float alphaB, const in float dotTV, const in float dotBV, const in float dotTL, const in float dotBL, const in float dotNV, const in float dotNL ) {
		float gv = dotNL * length( vec3( alphaT * dotTV, alphaB * dotBV, dotNV ) );
		float gl = dotNV * length( vec3( alphaT * dotTL, alphaB * dotBL, dotNL ) );
		return 0.5 / max( gv + gl, EPSILON );
	}
	float D_GGX_Anisotropic( const in float alphaT, const in float alphaB, const in float dotNH, const in float dotTH, const in float dotBH ) {
		float a2 = alphaT * alphaB;
		highp vec3 v = vec3( alphaB * dotTH, alphaT * dotBH, a2 * dotNH );
		highp float v2 = dot( v, v );
		float w2 = a2 / v2;
		return RECIPROCAL_PI * a2 * pow2 ( w2 );
	}
#endif
#ifdef USE_CLEARCOAT
	vec3 BRDF_GGX_Clearcoat( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material) {
		vec3 f0 = material.clearcoatF0;
		float f90 = material.clearcoatF90;
		float roughness = material.clearcoatRoughness;
		float alpha = pow2( roughness );
		vec3 halfDir = normalize( lightDir + viewDir );
		float dotNL = saturate( dot( normal, lightDir ) );
		float dotNV = saturate( dot( normal, viewDir ) );
		float dotNH = saturate( dot( normal, halfDir ) );
		float dotVH = saturate( dot( viewDir, halfDir ) );
		vec3 F = F_Schlick( f0, f90, dotVH );
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
		return F * ( V * D );
	}
#endif
vec3 BRDF_GGX( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {
	vec3 f0 = material.specularColorBlended;
	float f90 = material.specularF90;
	float roughness = material.roughness;
	float alpha = pow2( roughness );
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( f0, f90, dotVH );
	#ifdef USE_IRIDESCENCE
		F = mix( F, material.iridescenceFresnel, material.iridescence );
	#endif
	#ifdef USE_ANISOTROPY
		float dotTL = dot( material.anisotropyT, lightDir );
		float dotTV = dot( material.anisotropyT, viewDir );
		float dotTH = dot( material.anisotropyT, halfDir );
		float dotBL = dot( material.anisotropyB, lightDir );
		float dotBV = dot( material.anisotropyB, viewDir );
		float dotBH = dot( material.anisotropyB, halfDir );
		float V = V_GGX_SmithCorrelated_Anisotropic( material.alphaT, alpha, dotTV, dotBV, dotTL, dotBL, dotNV, dotNL );
		float D = D_GGX_Anisotropic( material.alphaT, alpha, dotNH, dotTH, dotBH );
	#else
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
	#endif
	return F * ( V * D );
}
vec2 LTC_Uv( const in vec3 N, const in vec3 V, const in float roughness ) {
	const float LUT_SIZE = 64.0;
	const float LUT_SCALE = ( LUT_SIZE - 1.0 ) / LUT_SIZE;
	const float LUT_BIAS = 0.5 / LUT_SIZE;
	float dotNV = saturate( dot( N, V ) );
	vec2 uv = vec2( roughness, sqrt( 1.0 - dotNV ) );
	uv = uv * LUT_SCALE + LUT_BIAS;
	return uv;
}
float LTC_ClippedSphereFormFactor( const in vec3 f ) {
	float l = length( f );
	return max( ( l * l + f.z ) / ( l + 1.0 ), 0.0 );
}
vec3 LTC_EdgeVectorFormFactor( const in vec3 v1, const in vec3 v2 ) {
	float x = dot( v1, v2 );
	float y = abs( x );
	float a = 0.8543985 + ( 0.4965155 + 0.0145206 * y ) * y;
	float b = 3.4175940 + ( 4.1616724 + y ) * y;
	float v = a / b;
	float theta_sintheta = ( x > 0.0 ) ? v : 0.5 * inversesqrt( max( 1.0 - x * x, 1e-7 ) ) - v;
	return cross( v1, v2 ) * theta_sintheta;
}
vec3 LTC_Evaluate( const in vec3 N, const in vec3 V, const in vec3 P, const in mat3 mInv, const in vec3 rectCoords[ 4 ] ) {
	vec3 v1 = rectCoords[ 1 ] - rectCoords[ 0 ];
	vec3 v2 = rectCoords[ 3 ] - rectCoords[ 0 ];
	vec3 lightNormal = cross( v1, v2 );
	if( dot( lightNormal, P - rectCoords[ 0 ] ) < 0.0 ) return vec3( 0.0 );
	vec3 T1, T2;
	T1 = normalize( V - N * dot( V, N ) );
	T2 = - cross( N, T1 );
	mat3 mat = mInv * transpose( mat3( T1, T2, N ) );
	vec3 coords[ 4 ];
	coords[ 0 ] = mat * ( rectCoords[ 0 ] - P );
	coords[ 1 ] = mat * ( rectCoords[ 1 ] - P );
	coords[ 2 ] = mat * ( rectCoords[ 2 ] - P );
	coords[ 3 ] = mat * ( rectCoords[ 3 ] - P );
	coords[ 0 ] = normalize( coords[ 0 ] );
	coords[ 1 ] = normalize( coords[ 1 ] );
	coords[ 2 ] = normalize( coords[ 2 ] );
	coords[ 3 ] = normalize( coords[ 3 ] );
	vec3 vectorFormFactor = vec3( 0.0 );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 0 ], coords[ 1 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 1 ], coords[ 2 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 2 ], coords[ 3 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 3 ], coords[ 0 ] );
	float result = LTC_ClippedSphereFormFactor( vectorFormFactor );
	return vec3( result );
}
#if defined( USE_SHEEN )
float D_Charlie( float roughness, float dotNH ) {
	float alpha = pow2( roughness );
	float invAlpha = 1.0 / alpha;
	float cos2h = dotNH * dotNH;
	float sin2h = max( 1.0 - cos2h, 0.0078125 );
	return ( 2.0 + invAlpha ) * pow( sin2h, invAlpha * 0.5 ) / ( 2.0 * PI );
}
float V_Neubelt( float dotNV, float dotNL ) {
	return saturate( 1.0 / ( 4.0 * ( dotNL + dotNV - dotNL * dotNV ) ) );
}
vec3 BRDF_Sheen( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, vec3 sheenColor, const in float sheenRoughness ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float D = D_Charlie( sheenRoughness, dotNH );
	float V = V_Neubelt( dotNV, dotNL );
	return sheenColor * ( D * V );
}
#endif
float IBLSheenBRDF( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	float r2 = roughness * roughness;
	float rInv = 1.0 / ( roughness + 0.1 );
	float a = -1.9362 + 1.0678 * roughness + 0.4573 * r2 - 0.8469 * rInv;
	float b = -0.6014 + 0.5538 * roughness - 0.4670 * r2 - 0.1255 * rInv;
	float DG = exp( a * dotNV + b );
	return saturate( DG );
}
vec3 EnvironmentBRDF( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	vec2 fab = texture2D( dfgLUT, vec2( roughness, dotNV ) ).rg;
	return specularColor * fab.x + specularF90 * fab.y;
}
#ifdef USE_IRIDESCENCE
void computeMultiscatteringIridescence( const in vec2 fab, const in vec3 specularColor, const in float specularF90, const in float iridescence, const in vec3 iridescenceF0, inout vec3 singleScatter, inout vec3 multiScatter ) {
#else
void computeMultiscattering( const in vec2 fab, const in vec3 specularColor, const in float specularF90, inout vec3 singleScatter, inout vec3 multiScatter ) {
#endif
	#ifdef USE_IRIDESCENCE
		vec3 Fr = mix( specularColor, iridescenceF0, iridescence );
	#else
		vec3 Fr = specularColor;
	#endif
	vec3 FssEss = Fr * fab.x + specularF90 * fab.y;
	float Ess = fab.x + fab.y;
	float Ems = 1.0 - Ess;
	vec3 Favg = Fr + ( 1.0 - Fr ) * 0.047619;	vec3 Fms = FssEss * Favg / ( 1.0 - Ems * Favg );
	singleScatter += FssEss;
	multiScatter += Fms * Ems;
}
#if NUM_RECT_AREA_LIGHTS > 0
	void RE_Direct_RectArea_Physical( const in RectAreaLight rectAreaLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
		vec3 normal = geometryNormal;
		vec3 viewDir = geometryViewDir;
		vec3 position = geometryPosition;
		vec3 lightPos = rectAreaLight.position;
		vec3 halfWidth = rectAreaLight.halfWidth;
		vec3 halfHeight = rectAreaLight.halfHeight;
		vec3 lightColor = rectAreaLight.color;
		float roughness = material.roughness;
		vec3 rectCoords[ 4 ];
		rectCoords[ 0 ] = lightPos + halfWidth - halfHeight;		rectCoords[ 1 ] = lightPos - halfWidth - halfHeight;
		rectCoords[ 2 ] = lightPos - halfWidth + halfHeight;
		rectCoords[ 3 ] = lightPos + halfWidth + halfHeight;
		vec2 uv = LTC_Uv( normal, viewDir, roughness );
		vec4 t1 = texture2D( ltc_1, uv );
		vec4 t2 = texture2D( ltc_2, uv );
		mat3 mInv = mat3(
			vec3( t1.x, 0, t1.y ),
			vec3(    0, 1,    0 ),
			vec3( t1.z, 0, t1.w )
		);
		vec3 fresnel = ( material.specularColorBlended * t2.x + ( material.specularF90 - material.specularColorBlended ) * t2.y );
		reflectedLight.directSpecular += lightColor * fresnel * LTC_Evaluate( normal, viewDir, position, mInv, rectCoords );
		reflectedLight.directDiffuse += lightColor * material.diffuseContribution * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords );
		#ifdef USE_CLEARCOAT
			vec3 Ncc = geometryClearcoatNormal;
			vec2 uvClearcoat = LTC_Uv( Ncc, viewDir, material.clearcoatRoughness );
			vec4 t1Clearcoat = texture2D( ltc_1, uvClearcoat );
			vec4 t2Clearcoat = texture2D( ltc_2, uvClearcoat );
			mat3 mInvClearcoat = mat3(
				vec3( t1Clearcoat.x, 0, t1Clearcoat.y ),
				vec3(             0, 1,             0 ),
				vec3( t1Clearcoat.z, 0, t1Clearcoat.w )
			);
			vec3 fresnelClearcoat = material.clearcoatF0 * t2Clearcoat.x + ( material.clearcoatF90 - material.clearcoatF0 ) * t2Clearcoat.y;
			clearcoatSpecularDirect += lightColor * fresnelClearcoat * LTC_Evaluate( Ncc, viewDir, position, mInvClearcoat, rectCoords );
		#endif
	}
#endif
void RE_Direct_Physical( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	#ifdef USE_CLEARCOAT
		float dotNLcc = saturate( dot( geometryClearcoatNormal, directLight.direction ) );
		vec3 ccIrradiance = dotNLcc * directLight.color;
		clearcoatSpecularDirect += ccIrradiance * BRDF_GGX_Clearcoat( directLight.direction, geometryViewDir, geometryClearcoatNormal, material );
	#endif
	#ifdef USE_SHEEN
 
 		sheenSpecularDirect += irradiance * BRDF_Sheen( directLight.direction, geometryViewDir, geometryNormal, material.sheenColor, material.sheenRoughness );
 
 		float sheenAlbedoV = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
 		float sheenAlbedoL = IBLSheenBRDF( geometryNormal, directLight.direction, material.sheenRoughness );
 
 		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * max( sheenAlbedoV, sheenAlbedoL );
 
 		irradiance *= sheenEnergyComp;
 
 	#endif
	vec3 specularBRDF = BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );
	#ifdef USE_RETROREFLECTION
		vec3 retroViewDir = reflect( - geometryViewDir, geometryNormal );
		vec3 retroSpecularBRDF = BRDF_GGX( directLight.direction, retroViewDir, geometryNormal, material );
		specularBRDF = mix( specularBRDF, retroSpecularBRDF, saturate( material.retroreflectivity ) );
	#endif
	reflectedLight.directSpecular += irradiance * specularBRDF * material.multiScatteringCompensation;
	vec3 halfDir = normalize( directLight.direction + geometryViewDir );
	float dotVH = saturate( dot( geometryViewDir, halfDir ) );
	vec3 F = F_Schlick( material.specularColor, material.specularF90, dotVH );
	#ifdef USE_RETROREFLECTION
		vec3 retroHalfDir = normalize( directLight.direction + retroViewDir );
		float dotRetroVH = saturate( dot( retroViewDir, retroHalfDir ) );
		vec3 retroF = F_Schlick( material.specularColor, material.specularF90, dotRetroVH );
		F = mix( F, retroF, saturate( material.retroreflectivity ) );
	#endif
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );
}
void RE_IndirectDiffuse_Physical( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 singleScattering = vec3( 0.0 );
	vec3 multiScattering = vec3( 0.0 );
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( material.dfg, material.specularColor, material.specularF90, material.iridescence, material.iridescenceF0Dielectric, singleScattering, multiScattering );
	#else
		computeMultiscattering( material.dfg, material.specularColor, material.specularF90, singleScattering, multiScattering );
	#endif
	vec3 diffuse = irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - singleScattering - multiScattering );
	#ifdef USE_SHEEN
		float sheenAlbedo = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
		sheenSpecularIndirect += irradiance * material.sheenColor * sheenAlbedo * RECIPROCAL_PI;
		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * sheenAlbedo;
		diffuse *= sheenEnergyComp;
	#endif
	reflectedLight.indirectDiffuse += diffuse;
}
void RE_IndirectSpecular_Physical( const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
	#ifdef USE_CLEARCOAT
		clearcoatSpecularIndirect += clearcoatRadiance * EnvironmentBRDF( geometryClearcoatNormal, geometryViewDir, material.clearcoatF0, material.clearcoatF90, material.clearcoatRoughness );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularIndirect += irradiance * material.sheenColor * IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness ) * RECIPROCAL_PI;
 	#endif
	vec3 singleScatteringDielectric = vec3( 0.0 );
	vec3 multiScatteringDielectric = vec3( 0.0 );
	vec3 singleScatteringMetallic = vec3( 0.0 );
	vec3 multiScatteringMetallic = vec3( 0.0 );
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( material.dfg, material.specularColor, material.specularF90, material.iridescence, material.iridescenceF0Dielectric, singleScatteringDielectric, multiScatteringDielectric );
		computeMultiscatteringIridescence( material.dfg, material.diffuseColor, material.specularF90, material.iridescence, material.iridescenceF0Metallic, singleScatteringMetallic, multiScatteringMetallic );
	#else
		computeMultiscattering( material.dfg, material.specularColor, material.specularF90, singleScatteringDielectric, multiScatteringDielectric );
		computeMultiscattering( material.dfg, material.diffuseColor, material.specularF90, singleScatteringMetallic, multiScatteringMetallic );
	#endif
	vec3 singleScattering = mix( singleScatteringDielectric, singleScatteringMetallic, material.metalness );
	vec3 multiScattering = mix( multiScatteringDielectric, multiScatteringMetallic, material.metalness );
	vec3 totalScatteringDielectric = singleScatteringDielectric + multiScatteringDielectric;
	vec3 diffuse = material.diffuseContribution * ( 1.0 - totalScatteringDielectric );
	vec3 cosineWeightedIrradiance = irradiance * RECIPROCAL_PI;
	vec3 indirectSpecular = radiance * singleScattering;
	indirectSpecular += multiScattering * cosineWeightedIrradiance;
	vec3 indirectDiffuse = diffuse * cosineWeightedIrradiance;
	#ifdef USE_SHEEN
		float sheenAlbedo = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * sheenAlbedo;
		indirectSpecular *= sheenEnergyComp;
		indirectDiffuse *= sheenEnergyComp;
	#endif
	reflectedLight.indirectSpecular += indirectSpecular;
	reflectedLight.indirectDiffuse += indirectDiffuse;
}
#define RE_Direct				RE_Direct_Physical
#define RE_Direct_RectArea		RE_Direct_RectArea_Physical
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Physical
#define RE_IndirectSpecular		RE_IndirectSpecular_Physical
float computeSpecularOcclusion( const in float dotNV, const in float ambientOcclusion, const in float roughness ) {
	return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );
}`,wc=`
vec3 geometryPosition = - vViewPosition;
vec3 geometryNormal = normal;
vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );
vec3 geometryClearcoatNormal = vec3( 0.0 );
#ifdef USE_CLEARCOAT
	geometryClearcoatNormal = clearcoatNormal;
#endif
#ifdef USE_IRIDESCENCE
	float dotNVi = saturate( dot( normal, geometryViewDir ) );
	if ( material.iridescenceThickness == 0.0 ) {
		material.iridescence = 0.0;
	} else {
		material.iridescence = saturate( material.iridescence );
	}
	if ( material.iridescence > 0.0 ) {
		vec3 iridescenceFresnelDielectric = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.specularColor );
		vec3 iridescenceFresnelMetallic = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.diffuseColor );
		material.iridescenceFresnel = mix( iridescenceFresnelDielectric, iridescenceFresnelMetallic, material.metalness );
		material.iridescenceF0Dielectric = Schlick_to_F0( iridescenceFresnelDielectric, 1.0, dotNVi );
		material.iridescenceF0Metallic = Schlick_to_F0( iridescenceFresnelMetallic, 1.0, dotNVi );
	}
#endif
#ifdef STANDARD
	float dotNVms = saturate( dot( geometryNormal, geometryViewDir ) );
	material.dfg = texture2D( dfgLUT, vec2( material.roughness, dotNVms ) ).rg;
	#if ( NUM_SUN_LIGHTS > 0 || NUM_DIR_LIGHTS > 0 || NUM_POINT_LIGHTS > 0 || NUM_SPOT_LIGHTS > 0 )
		float EssMs = material.dfg.x + material.dfg.y;
		material.multiScatteringCompensation = 1.0 + material.specularColorBlended * ( 1.0 / EssMs - 1.0 );
	#endif
#endif
IncidentLight directLight;
#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )
	PointLight pointLight;
	#if defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
		pointLight = pointLights[ i ];
		getPointLightInfo( pointLight, geometryPosition, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS ) && ( defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_BASIC ) )
		pointLightShadow = pointLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowIntensity, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )
	SpotLight spotLight;
	vec4 spotColor;
	vec3 spotLightCoord;
	bool inSpotLightMap;
	#if defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {
		spotLight = spotLights[ i ];
		getSpotLightInfo( spotLight, geometryPosition, directLight );
		#if ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#define SPOT_LIGHT_MAP_INDEX UNROLLED_LOOP_INDEX
		#elif ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		#define SPOT_LIGHT_MAP_INDEX NUM_SPOT_LIGHT_MAPS
		#else
		#define SPOT_LIGHT_MAP_INDEX ( UNROLLED_LOOP_INDEX - NUM_SPOT_LIGHT_SHADOWS + NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#endif
		#if ( SPOT_LIGHT_MAP_INDEX < NUM_SPOT_LIGHT_MAPS )
			spotLightCoord = vSpotLightCoord[ i ].xyz / vSpotLightCoord[ i ].w;
			inSpotLightMap = all( lessThan( abs( spotLightCoord * 2. - 1. ), vec3( 1.0 ) ) );
			spotColor = texture2D( spotLightMap[ SPOT_LIGHT_MAP_INDEX ], spotLightCoord.xy );
			directLight.color = inSpotLightMap ? directLight.color * spotColor.rgb : directLight.color;
		#endif
		#undef SPOT_LIGHT_MAP_INDEX
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		spotLightShadow = spotLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowIntensity, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_SUN_LIGHTS > 0 ) && defined( RE_Direct )
	SunLight sunLight;
	#if defined( USE_SHADOWMAP ) && NUM_SUN_LIGHT_SHADOWS > 0
	SunLightShadow sunLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SUN_LIGHTS; i ++ ) {
		sunLight = sunLights[ i ];
		getSunLightInfo( sunLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SUN_LIGHT_SHADOWS )
		sunLightShadow = sunLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getSunShadow( sunShadowMap[ i ], sunLightShadow, UNROLLED_LOOP_INDEX ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
		directionalLight = directionalLights[ i ];
		getDirectionalLightInfo( directionalLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directionalLightShadow = directionalLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )
	RectAreaLight rectAreaLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_RECT_AREA_LIGHTS; i ++ ) {
		rectAreaLight = rectAreaLights[ i ];
		RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if defined( RE_IndirectDiffuse )
	vec3 iblIrradiance = vec3( 0.0 );
	vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );
	#if defined( USE_LIGHT_PROBES )
		irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );
	#endif
	#if ( NUM_HEMI_LIGHTS > 0 )
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {
			irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );
		}
		#pragma unroll_loop_end
	#endif
	#ifdef USE_LIGHT_PROBES_GRID
		vec3 probeWorldPos = ( ( vec4( geometryPosition, 1.0 ) - viewMatrix[ 3 ] ) * viewMatrix ).xyz;
		vec3 probeWorldNormal = transformNormalByInverseViewMatrix( geometryNormal, viewMatrix );
		irradiance += getLightProbeGridIrradiance( probeWorldPos, probeWorldNormal );
	#endif
#endif
#if defined( RE_IndirectSpecular )
	vec3 radiance = vec3( 0.0 );
	vec3 clearcoatRadiance = vec3( 0.0 );
#endif`,Uc=`#if defined( RE_IndirectDiffuse )
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;
		irradiance += lightMapIrradiance;
	#endif
	#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
		#if defined( STANDARD ) || defined( LAMBERT ) || defined( PHONG )
			iblIrradiance += getIBLIrradiance( geometryNormal );
		#endif
	#endif
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	#ifdef USE_ANISOTROPY
		vec3 iblRadiance = getIBLAnisotropyRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
	#else
		vec3 iblRadiance = getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );
	#endif
	#ifdef USE_RETROREFLECTION
		#ifdef USE_ANISOTROPY
			vec3 retroIBLRadiance = getIBLAnisotropyRetroRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
		#else
			vec3 retroIBLRadiance = getIBLRetroRadiance( geometryViewDir, geometryNormal, material.roughness );
		#endif
		iblRadiance = mix( iblRadiance, retroIBLRadiance, saturate( material.retroreflectivity ) );
	#endif
	radiance += iblRadiance;
	#ifdef USE_CLEARCOAT
		clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness );
	#endif
#endif`,Dc=`#if defined( RE_IndirectDiffuse )
	#if defined( LAMBERT ) || defined( PHONG )
		irradiance += iblIrradiance;
	#endif
	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`,Ic=`#ifdef USE_LIGHT_PROBES_GRID
uniform highp sampler3D probesSH;
uniform vec3 probesMin;
uniform vec3 probesMax;
uniform vec3 probesResolution;
vec3 getLightProbeGridIrradiance( vec3 worldPos, vec3 worldNormal ) {
	vec3 res = probesResolution;
	vec3 gridRange = probesMax - probesMin;
	vec3 resMinusOne = res - 1.0;
	vec3 probeSpacing = gridRange / resMinusOne;
	vec3 samplePos = worldPos + worldNormal * probeSpacing * 0.5;
	vec3 uvw = clamp( ( samplePos - probesMin ) / gridRange, 0.0, 1.0 );
	uvw = uvw * resMinusOne / res + 0.5 / res;
	float nz          = res.z;
	float paddedSlices = nz + 2.0;
	float atlasDepth  = 7.0 * paddedSlices;
	float uvZBase     = uvw.z * nz + 1.0;
	vec4 s0 = texture( probesSH, vec3( uvw.xy, ( uvZBase                       ) / atlasDepth ) );
	vec4 s1 = texture( probesSH, vec3( uvw.xy, ( uvZBase +       paddedSlices   ) / atlasDepth ) );
	vec4 s2 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 2.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s3 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 3.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s4 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 4.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s5 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 5.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s6 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 6.0 * paddedSlices   ) / atlasDepth ) );
	vec3 c0 = s0.xyz;
	vec3 c1 = vec3( s0.w, s1.xy );
	vec3 c2 = vec3( s1.zw, s2.x );
	vec3 c3 = s2.yzw;
	vec3 c4 = s3.xyz;
	vec3 c5 = vec3( s3.w, s4.xy );
	vec3 c6 = vec3( s4.zw, s5.x );
	vec3 c7 = s5.yzw;
	vec3 c8 = s6.xyz;
	float x = worldNormal.x, y = worldNormal.y, z = worldNormal.z;
	vec3 result = c0 * 0.886227;
	result += c1 * 2.0 * 0.511664 * y;
	result += c2 * 2.0 * 0.511664 * z;
	result += c3 * 2.0 * 0.511664 * x;
	result += c4 * 2.0 * 0.429043 * x * y;
	result += c5 * 2.0 * 0.429043 * y * z;
	result += c6 * ( 0.743125 * z * z - 0.247708 );
	result += c7 * 2.0 * 0.429043 * x * z;
	result += c8 * 0.429043 * ( x * x - y * y );
	return max( result, vec3( 0.0 ) );
}
#endif`,Nc=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif`,yc=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,Oc=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,Fc=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	vFragDepth = 1.0 + gl_Position.w;
	vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
#endif`,Bc=`#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,Gc=`#ifdef USE_MAP
	uniform sampler2D map;
#endif`,Hc=`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
	#if defined( USE_POINTS_UV )
		vec2 uv = vUv;
	#else
		vec2 uv = ( uvTransform * vec3( gl_PointCoord.x, 1.0 - gl_PointCoord.y, 1 ) ).xy;
	#endif
#endif
#ifdef USE_MAP
	diffuseColor *= texture2D( map, uv );
#endif
#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, uv ).g;
#endif`,Vc=`#if defined( USE_POINTS_UV )
	varying vec2 vUv;
#else
	#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
		uniform mat3 uvTransform;
	#endif
#endif
#ifdef USE_MAP
	uniform sampler2D map;
#endif
#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,kc=`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif`,Wc=`#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif`,zc=`#ifdef USE_INSTANCING_MORPH
	float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;
	}
#endif`,Xc=`#if defined( USE_MORPHCOLORS )
	vColor *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		#if defined( USE_COLOR_ALPHA )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
		#elif defined( USE_COLOR )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
		#endif
	}
#endif`,Kc=`#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,Yc=`#ifdef USE_MORPHTARGETS
	#ifndef USE_INSTANCING_MORPH
		uniform float morphTargetBaseInfluence;
		uniform float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	#endif
	uniform sampler2DArray morphTargetsTexture;
	uniform ivec2 morphTargetsTextureSize;
	vec4 getMorph( const in int vertexIndex, const in int morphTargetIndex, const in int offset ) {
		int texelIndex = vertexIndex * MORPHTARGETS_TEXTURE_STRIDE + offset;
		int y = texelIndex / morphTargetsTextureSize.x;
		int x = texelIndex - y * morphTargetsTextureSize.x;
		ivec3 morphUV = ivec3( x, y, morphTargetIndex );
		return texelFetch( morphTargetsTexture, morphUV, 0 );
	}
#endif`,qc=`#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,Zc=`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
#ifdef FLAT_SHADED
	vec3 fdx = dFdx( vViewPosition );
	vec3 fdy = dFdy( vViewPosition );
	vec3 normal = normalize( cross( fdx, fdy ) );
#else
	vec3 normal = normalize( vNormal );
	#ifdef DOUBLE_SIDED
		normal *= faceDirection;
	#endif
#endif
#if defined( USE_NORMALMAP_TANGENTSPACE ) || defined( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY )
	#ifdef USE_TANGENT
		mat3 tbn = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn = getTangentFrame( - vViewPosition, normal,
		#if defined( USE_NORMALMAP )
			vNormalMapUv
		#elif defined( USE_CLEARCOAT_NORMALMAP )
			vClearcoatNormalMapUv
		#else
			vUv
		#endif
		);
	#endif
	#ifdef DOUBLE_SIDED
		tbn[0] *= faceDirection;
		tbn[1] *= faceDirection;
	#endif
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	#ifdef USE_TANGENT
		mat3 tbn2 = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn2 = getTangentFrame( - vViewPosition, normal, vClearcoatNormalMapUv );
	#endif
	#ifdef DOUBLE_SIDED
		tbn2[0] *= faceDirection;
		tbn2[1] *= faceDirection;
	#endif
#endif
vec3 nonPerturbedNormal = normal;`,$c=`#ifdef USE_NORMALMAP_OBJECTSPACE
	normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#ifdef FLIP_SIDED
		normal = - normal;
	#endif
	#ifdef DOUBLE_SIDED
		normal = normal * faceDirection;
	#endif
	normal = normalize( normalMatrix * normal );
#elif defined( USE_NORMALMAP_TANGENTSPACE )
	vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#if defined( USE_PACKED_NORMALMAP )
		mapN = vec3( mapN.xy, sqrt( saturate( 1.0 - dot( mapN.xy, mapN.xy ) ) ) );
	#endif
	mapN.xy *= normalScale;
	normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
	normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif`,jc=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,Qc=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,Jc=`#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
		#ifdef FLIP_SIDED
			vBitangent = - vBitangent;
		#endif
	#endif
#endif`,el=`#ifdef USE_NORMALMAP
	uniform sampler2D normalMap;
	uniform vec2 normalScale;
#endif
#ifdef USE_NORMALMAP_OBJECTSPACE
	uniform mat3 normalMatrix;
#endif
#if ! defined ( USE_TANGENT ) && ( defined ( USE_NORMALMAP_TANGENTSPACE ) || defined ( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY ) )
	mat3 getTangentFrame( vec3 eye_pos, vec3 surf_norm, vec2 uv ) {
		vec3 q0 = dFdx( eye_pos.xyz );
		vec3 q1 = dFdy( eye_pos.xyz );
		vec2 st0 = dFdx( uv.st );
		vec2 st1 = dFdy( uv.st );
		vec3 N = surf_norm;
		vec3 q1perp = cross( q1, N );
		vec3 q0perp = cross( N, q0 );
		vec3 T = q1perp * st0.x + q0perp * st1.x;
		vec3 B = q1perp * st0.y + q0perp * st1.y;
		float det = max( dot( T, T ), dot( B, B ) );
		float scale = ( det == 0.0 ) ? 0.0 : inversesqrt( det );
		return mat3( T * scale, B * scale, N );
	}
#endif`,tl=`#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal = nonPerturbedNormal;
#endif`,nl=`#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif`,il=`#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif`,rl=`#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif`,al=`#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,ol=`vec3 packNormalToRGB( const in vec3 normal ) {
	return normalize( normal ) * 0.5 + 0.5;
}
vec3 unpackRGBToNormal( const in vec3 rgb ) {
	return 2.0 * rgb.xyz - 1.0;
}
const float PackUpscale = 256. / 255.;const float UnpackDownscale = 255. / 256.;const float ShiftRight8 = 1. / 256.;
const float Inv255 = 1. / 255.;
const vec4 PackFactors = vec4( 1.0, 256.0, 256.0 * 256.0, 256.0 * 256.0 * 256.0 );
const vec2 UnpackFactors2 = vec2( UnpackDownscale, 1.0 / PackFactors.g );
const vec3 UnpackFactors3 = vec3( UnpackDownscale / PackFactors.rg, 1.0 / PackFactors.b );
const vec4 UnpackFactors4 = vec4( UnpackDownscale / PackFactors.rgb, 1.0 / PackFactors.a );
vec4 packDepthToRGBA( const in float v ) {
	if( v <= 0.0 )
		return vec4( 0., 0., 0., 0. );
	if( v >= 1.0 )
		return vec4( 1., 1., 1., 1. );
	float vuf;
	float af = modf( v * PackFactors.a, vuf );
	float bf = modf( vuf * ShiftRight8, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec4( vuf * Inv255, gf * PackUpscale, bf * PackUpscale, af );
}
vec3 packDepthToRGB( const in float v ) {
	if( v <= 0.0 )
		return vec3( 0., 0., 0. );
	if( v >= 1.0 )
		return vec3( 1., 1., 1. );
	float vuf;
	float bf = modf( v * PackFactors.b, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec3( vuf * Inv255, gf * PackUpscale, bf );
}
vec2 packDepthToRG( const in float v ) {
	if( v <= 0.0 )
		return vec2( 0., 0. );
	if( v >= 1.0 )
		return vec2( 1., 1. );
	float vuf;
	float gf = modf( v * 256., vuf );
	return vec2( vuf * Inv255, gf );
}
float unpackRGBAToDepth( const in vec4 v ) {
	return dot( v, UnpackFactors4 );
}
float unpackRGBToDepth( const in vec3 v ) {
	return dot( v, UnpackFactors3 );
}
float unpackRGToDepth( const in vec2 v ) {
	return v.r * UnpackFactors2.r + v.g * UnpackFactors2.g;
}
vec4 pack2HalfToRGBA( const in vec2 v ) {
	vec4 r = vec4( v.x, fract( v.x * 255.0 ), v.y, fract( v.y * 255.0 ) );
	return vec4( r.x - r.y / 255.0, r.y, r.z - r.w / 255.0, r.w );
}
vec2 unpackRGBATo2Half( const in vec4 v ) {
	return vec2( v.x + ( v.y / 255.0 ), v.z + ( v.w / 255.0 ) );
}
float viewZToOrthographicDepth( const in float viewZ, const in float near, const in float far ) {
	return ( viewZ + near ) / ( near - far );
}
float orthographicDepthToViewZ( const in float depth, const in float near, const in float far ) {
	#ifdef USE_REVERSED_DEPTH_BUFFER
	
		return depth * ( far - near ) - far;
	#else
		return depth * ( near - far ) - near;
	#endif
}
float viewZToPerspectiveDepth( const in float viewZ, const in float near, const in float far ) {
	return ( ( near + viewZ ) * far ) / ( ( far - near ) * viewZ );
}
float perspectiveDepthToViewZ( const in float depth, const in float near, const in float far ) {
	
	#ifdef USE_REVERSED_DEPTH_BUFFER
		return ( near * far ) / ( ( near - far ) * depth - near );
	#else
		return ( near * far ) / ( ( far - near ) * depth - far );
	#endif
}`,sl=`#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif`,cl=`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,ll=`#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif`,fl=`#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif`,ul=`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif`,dl=`#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif`,pl=`#if NUM_SPOT_LIGHT_COORDS > 0
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#if NUM_SPOT_LIGHT_MAPS > 0
	uniform sampler2D spotLightMap[ NUM_SPOT_LIGHT_MAPS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_SUN_LIGHT_SHADOWS > 0
		#define SUN_LIGHT_CASCADES 2
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow sunShadowMap[ NUM_SUN_LIGHT_SHADOWS ];
		#else
			uniform sampler2D sunShadowMap[ NUM_SUN_LIGHT_SHADOWS ];
		#endif
		uniform mat4 sunShadowMatrix[ NUM_SUN_LIGHT_SHADOWS * SUN_LIGHT_CASCADES ];
		uniform vec4 sunShadowCascade[ NUM_SUN_LIGHT_SHADOWS * SUN_LIGHT_CASCADES ];
		varying vec4 vSunShadowWorldPosition;
		varying vec3 vSunShadowWorldNormal;
		struct SunLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SunLightShadow sunLightShadows[ NUM_SUN_LIGHT_SHADOWS ];
	#endif
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		#else
			uniform sampler2D directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		#endif
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		#else
			uniform sampler2D spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		#endif
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform samplerCubeShadow pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		#elif defined( SHADOWMAP_TYPE_BASIC )
			uniform samplerCube pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		#endif
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
	#if defined( SHADOWMAP_TYPE_PCF )
		float interleavedGradientNoise( vec2 position ) {
			return fract( 52.9829189 * fract( dot( position, vec2( 0.06711056, 0.00583715 ) ) ) );
		}
		vec2 vogelDiskSample( int sampleIndex, int samplesCount, float phi ) {
			const float goldenAngle = 2.399963229728653;
			float r = sqrt( ( float( sampleIndex ) + 0.5 ) / float( samplesCount ) );
			float theta = float( sampleIndex ) * goldenAngle + phi;
			return vec2( cos( theta ), sin( theta ) ) * r;
		}
	#endif
	#if defined( SHADOWMAP_TYPE_PCF )
		float getShadow( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			shadowCoord.z += shadowBias;
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
				float radius = shadowRadius * texelSize.x;
				float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
				shadow = (
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 0, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 1, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 2, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 3, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 4, 5, phi ) * radius, shadowCoord.z ) )
				) * 0.2;
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#elif defined( SHADOWMAP_TYPE_VSM )
		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				shadowCoord.z -= shadowBias;
			#else
				shadowCoord.z += shadowBias;
			#endif
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				vec2 distribution = texture2D( shadowMap, shadowCoord.xy ).rg;
				float mean = distribution.x;
				float variance = distribution.y * distribution.y;
				#ifdef USE_REVERSED_DEPTH_BUFFER
					float hard_shadow = step( mean, shadowCoord.z );
				#else
					float hard_shadow = step( shadowCoord.z, mean );
				#endif
				
				if ( hard_shadow == 1.0 ) {
					shadow = 1.0;
				} else {
					variance = max( variance, 0.0000001 );
					float d = shadowCoord.z - mean;
					float p_max = variance / ( variance + d * d );
					p_max = clamp( ( p_max - 0.3 ) / 0.65, 0.0, 1.0 );
					shadow = max( hard_shadow, p_max );
				}
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#else
		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				shadowCoord.z -= shadowBias;
			#else
				shadowCoord.z += shadowBias;
			#endif
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				float depth = texture2D( shadowMap, shadowCoord.xy ).r;
				#ifdef USE_REVERSED_DEPTH_BUFFER
					shadow = step( depth, shadowCoord.z );
				#else
					shadow = step( shadowCoord.z, depth );
				#endif
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#endif
	#if NUM_SUN_LIGHT_SHADOWS > 0
		float getSunShadow(
			#if defined( SHADOWMAP_TYPE_PCF )
				sampler2DShadow shadowMap,
			#else
				sampler2D shadowMap,
			#endif
			SunLightShadow sunLightShadow,
			int shadowIndex
		) {
			vec4 shadowWorldPosition = vec4( vSunShadowWorldPosition.xyz + vSunShadowWorldNormal * sunLightShadow.shadowNormalBias, 1.0 );
			float viewDepth = vSunShadowWorldPosition.w;
			int cascadeOffset = shadowIndex * SUN_LIGHT_CASCADES;
			float shadow = 1.0;
			for ( int i = SUN_LIGHT_CASCADES - 1; i >= 0; i -- ) {
				vec4 cascade = sunShadowCascade[ cascadeOffset + i ];
				if ( viewDepth >= cascade.x && viewDepth < cascade.y ) {
					float cascadeShadow = getShadow(
						shadowMap,
						sunLightShadow.shadowMapSize,
						sunLightShadow.shadowIntensity,
						sunLightShadow.shadowBias,
						sunLightShadow.shadowRadius,
						sunShadowMatrix[ cascadeOffset + i ] * shadowWorldPosition
					);
					shadow = mix( cascadeShadow, shadow, smoothstep( cascade.z, cascade.y, viewDepth ) );
				}
			}
			return shadow;
		}
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
	#if defined( SHADOWMAP_TYPE_PCF )
	float getPointShadow( samplerCubeShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		vec3 bd3D = normalize( lightToPosition );
		vec3 absVec = abs( lightToPosition );
		float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );
		if ( viewSpaceZ - shadowCameraFar <= 0.0 && viewSpaceZ - shadowCameraNear >= 0.0 ) {
			#ifdef USE_REVERSED_DEPTH_BUFFER
				float dp = ( shadowCameraNear * ( shadowCameraFar - viewSpaceZ ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
				dp -= shadowBias;
			#else
				float dp = ( shadowCameraFar * ( viewSpaceZ - shadowCameraNear ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
				dp += shadowBias;
			#endif
			float texelSize = shadowRadius / shadowMapSize.x;
			vec3 absDir = abs( bd3D );
			vec3 tangent = absDir.x > absDir.z ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 );
			tangent = normalize( cross( bd3D, tangent ) );
			vec3 bitangent = cross( bd3D, tangent );
			float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
			vec2 sample0 = vogelDiskSample( 0, 5, phi );
			vec2 sample1 = vogelDiskSample( 1, 5, phi );
			vec2 sample2 = vogelDiskSample( 2, 5, phi );
			vec2 sample3 = vogelDiskSample( 3, 5, phi );
			vec2 sample4 = vogelDiskSample( 4, 5, phi );
			shadow = (
				texture( shadowMap, vec4( bd3D + ( tangent * sample0.x + bitangent * sample0.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample1.x + bitangent * sample1.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample2.x + bitangent * sample2.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample3.x + bitangent * sample3.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample4.x + bitangent * sample4.y ) * texelSize, dp ) )
			) * 0.2;
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	#elif defined( SHADOWMAP_TYPE_BASIC )
	float getPointShadow( samplerCube shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		vec3 absVec = abs( lightToPosition );
		float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );
		if ( viewSpaceZ - shadowCameraFar <= 0.0 && viewSpaceZ - shadowCameraNear >= 0.0 ) {
			float dp = ( shadowCameraFar * ( viewSpaceZ - shadowCameraNear ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
			dp += shadowBias;
			vec3 bd3D = normalize( lightToPosition );
			float depth = textureCube( shadowMap, bd3D ).r;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				depth = 1.0 - depth;
			#endif
			shadow = step( dp, depth );
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	#endif
	#endif
#endif`,hl=`#if NUM_SPOT_LIGHT_COORDS > 0
	uniform mat4 spotLightMatrix[ NUM_SPOT_LIGHT_COORDS ];
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_SUN_LIGHT_SHADOWS > 0
		varying vec4 vSunShadowWorldPosition;
		varying vec3 vSunShadowWorldNormal;
	#endif
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform mat4 pointShadowMatrix[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
#endif`,ml=`#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_SUN_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
	#ifdef HAS_NORMAL
		vec3 shadowWorldNormal = transformNormalByInverseViewMatrix( transformedNormal, viewMatrix );
	#else
		vec3 shadowWorldNormal = vec3( 0.0 );
	#endif
	vec4 shadowWorldPosition;
#endif
#if defined( USE_SHADOWMAP )
	#if NUM_SUN_LIGHT_SHADOWS > 0
		vSunShadowWorldPosition = vec4( worldPosition.xyz, - mvPosition.z );
		vSunShadowWorldNormal = shadowWorldNormal;
	#endif
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0 );
			vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * pointLightShadows[ i ].shadowNormalBias, 0 );
			vPointShadowCoord[ i ] = pointShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
#endif
#if NUM_SPOT_LIGHT_COORDS > 0
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_COORDS; i ++ ) {
		shadowWorldPosition = worldPosition;
		#if ( defined( USE_SHADOWMAP ) && UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
			shadowWorldPosition.xyz += shadowWorldNormal * spotLightShadows[ i ].shadowNormalBias;
		#endif
		vSpotLightCoord[ i ] = spotLightMatrix[ i ] * shadowWorldPosition;
	}
	#pragma unroll_loop_end
#endif`,_l=`float getShadowMask() {
	float shadow = 1.0;
	#ifdef USE_SHADOWMAP
	#if NUM_SUN_LIGHT_SHADOWS > 0
	SunLightShadow sunLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SUN_LIGHT_SHADOWS; i ++ ) {
		sunLight = sunLightShadows[ i ];
		shadow *= receiveShadow ? getSunShadow( sunShadowMap[ i ], sunLight, UNROLLED_LOOP_INDEX ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
		directionalLight = directionalLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowIntensity, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i ++ ) {
		spotLight = spotLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( spotShadowMap[ i ], spotLight.shadowMapSize, spotLight.shadowIntensity, spotLight.shadowBias, spotLight.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0 && ( defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_BASIC ) )
	PointLightShadow pointLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
		pointLight = pointLightShadows[ i ];
		shadow *= receiveShadow ? getPointShadow( pointShadowMap[ i ], pointLight.shadowMapSize, pointLight.shadowIntensity, pointLight.shadowBias, pointLight.shadowRadius, vPointShadowCoord[ i ], pointLight.shadowCameraNear, pointLight.shadowCameraFar ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#endif
	return shadow;
}`,gl=`#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif`,vl=`#ifdef USE_SKINNING
	uniform mat4 bindMatrix;
	uniform mat4 bindMatrixInverse;
	uniform highp sampler2D boneTexture;
	mat4 getBoneMatrix( const in float i ) {
		int size = textureSize( boneTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( boneTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( boneTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( boneTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( boneTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
#endif`,Sl=`#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif`,El=`#ifdef USE_SKINNING
	mat4 skinMatrix = mat4( 0.0 );
	skinMatrix += skinWeight.x * boneMatX;
	skinMatrix += skinWeight.y * boneMatY;
	skinMatrix += skinWeight.z * boneMatZ;
	skinMatrix += skinWeight.w * boneMatW;
	skinMatrix = bindMatrixInverse * skinMatrix * bindMatrix;
	objectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;
	#ifdef USE_TANGENT
		objectTangent = vec4( skinMatrix * vec4( objectTangent, 0.0 ) ).xyz;
	#endif
#endif`,xl=`float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif`,Ml=`#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif`,Tl=`#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`,Al=`#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
uniform float toneMappingExposure;
vec3 LinearToneMapping( vec3 color ) {
	return saturate( toneMappingExposure * color );
}
vec3 ReinhardToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	return saturate( color / ( vec3( 1.0 ) + color ) );
}
vec3 CineonToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	color = max( vec3( 0.0 ), color - 0.004 );
	return pow( ( color * ( 6.2 * color + 0.5 ) ) / ( color * ( 6.2 * color + 1.7 ) + 0.06 ), vec3( 2.2 ) );
}
vec3 RRTAndODTFit( vec3 v ) {
	vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
	vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
	return a / b;
}
vec3 ACESFilmicToneMapping( vec3 color ) {
	const mat3 ACESInputMat = mat3(
		vec3( 0.59719, 0.07600, 0.02840 ),		vec3( 0.35458, 0.90834, 0.13383 ),
		vec3( 0.04823, 0.01566, 0.83777 )
	);
	const mat3 ACESOutputMat = mat3(
		vec3(  1.60475, -0.10208, -0.00327 ),		vec3( -0.53108,  1.10813, -0.07276 ),
		vec3( -0.07367, -0.00605,  1.07602 )
	);
	color *= toneMappingExposure / 0.6;
	color = ACESInputMat * color;
	color = RRTAndODTFit( color );
	color = ACESOutputMat * color;
	return saturate( color );
}
const mat3 LINEAR_REC2020_TO_LINEAR_SRGB = mat3(
	vec3( 1.6605, - 0.1246, - 0.0182 ),
	vec3( - 0.5876, 1.1329, - 0.1006 ),
	vec3( - 0.0728, - 0.0083, 1.1187 )
);
const mat3 LINEAR_SRGB_TO_LINEAR_REC2020 = mat3(
	vec3( 0.6274, 0.0691, 0.0164 ),
	vec3( 0.3293, 0.9195, 0.0880 ),
	vec3( 0.0433, 0.0113, 0.8956 )
);
vec3 agxDefaultContrastApprox( vec3 x ) {
	vec3 x2 = x * x;
	vec3 x4 = x2 * x2;
	return + 15.5 * x4 * x2
		- 40.14 * x4 * x
		+ 31.96 * x4
		- 6.868 * x2 * x
		+ 0.4298 * x2
		+ 0.1191 * x
		- 0.00232;
}
vec3 AgXToneMapping( vec3 color ) {
	const mat3 AgXInsetMatrix = mat3(
		vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ),
		vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ),
		vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 )
	);
	const mat3 AgXOutsetMatrix = mat3(
		vec3( 1.1271005818144368, - 0.1413297634984383, - 0.14132976349843826 ),
		vec3( - 0.11060664309660323, 1.157823702216272, - 0.11060664309660294 ),
		vec3( - 0.016493938717834573, - 0.016493938717834257, 1.2519364065950405 )
	);
	const float AgxMinEv = - 12.47393;	const float AgxMaxEv = 4.026069;
	color *= toneMappingExposure;
	color = LINEAR_SRGB_TO_LINEAR_REC2020 * color;
	color = AgXInsetMatrix * color;
	color = max( color, 1e-10 );	color = log2( color );
	color = ( color - AgxMinEv ) / ( AgxMaxEv - AgxMinEv );
	color = clamp( color, 0.0, 1.0 );
	color = agxDefaultContrastApprox( color );
	color = AgXOutsetMatrix * color;
	color = pow( max( vec3( 0.0 ), color ), vec3( 2.2 ) );
	color = LINEAR_REC2020_TO_LINEAR_SRGB * color;
	color = clamp( color, 0.0, 1.0 );
	return color;
}
vec3 NeutralToneMapping( vec3 color ) {
	const float StartCompression = 0.8 - 0.04;
	const float Desaturation = 0.15;
	color *= toneMappingExposure;
	float x = min( color.r, min( color.g, color.b ) );
	float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
	color -= offset;
	float peak = max( color.r, max( color.g, color.b ) );
	if ( peak < StartCompression ) return color;
	float d = 1. - StartCompression;
	float newPeak = 1. - d * d / ( peak + d - StartCompression );
	color *= newPeak / peak;
	float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );
	return mix( color, vec3( newPeak ), g );
}
vec3 CustomToneMapping( vec3 color ) { return color; }`,Rl=`#ifdef USE_TRANSMISSION
	material.transmission = transmission;
	material.transmissionAlpha = 1.0;
	material.thickness = thickness;
	material.attenuationDistance = attenuationDistance;
	material.attenuationColor = attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		material.transmission *= texture2D( transmissionMap, vTransmissionMapUv ).r;
	#endif
	#ifdef USE_THICKNESSMAP
		material.thickness *= texture2D( thicknessMap, vThicknessMapUv ).g;
	#endif
	vec3 pos = vWorldPosition;
	vec3 v = normalize( cameraPosition - pos );
	vec3 n = transformNormalByInverseViewMatrix( normal, viewMatrix );
	vec4 transmitted = getIBLVolumeRefraction(
		n, v, material.roughness, material.diffuseContribution, material.specularColorBlended, material.specularF90,
		pos, modelMatrix, viewMatrix, projectionMatrix, material.dispersion, material.ior, material.thickness,
		material.attenuationColor, material.attenuationDistance );
	material.transmissionAlpha = mix( material.transmissionAlpha, transmitted.a, material.transmission );
	totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );
#endif`,bl=`#ifdef USE_TRANSMISSION
	uniform float transmission;
	uniform float thickness;
	uniform float attenuationDistance;
	uniform vec3 attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		uniform sampler2D transmissionMap;
	#endif
	#ifdef USE_THICKNESSMAP
		uniform sampler2D thicknessMap;
	#endif
	uniform vec2 transmissionSamplerSize;
	uniform sampler2D transmissionSamplerMap;
	uniform mat4 modelMatrix;
	uniform mat4 projectionMatrix;
	varying vec3 vWorldPosition;
	float w0( float a ) {
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - a + 3.0 ) - 3.0 ) + 1.0 );
	}
	float w1( float a ) {
		return ( 1.0 / 6.0 ) * ( a *  a * ( 3.0 * a - 6.0 ) + 4.0 );
	}
	float w2( float a ){
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - 3.0 * a + 3.0 ) + 3.0 ) + 1.0 );
	}
	float w3( float a ) {
		return ( 1.0 / 6.0 ) * ( a * a * a );
	}
	float g0( float a ) {
		return w0( a ) + w1( a );
	}
	float g1( float a ) {
		return w2( a ) + w3( a );
	}
	float h0( float a ) {
		return - 1.0 + w1( a ) / ( w0( a ) + w1( a ) );
	}
	float h1( float a ) {
		return 1.0 + w3( a ) / ( w2( a ) + w3( a ) );
	}
	vec4 bicubic( sampler2D tex, vec2 uv, vec4 texelSize, float lod ) {
		uv = uv * texelSize.zw + 0.5;
		vec2 iuv = floor( uv );
		vec2 fuv = fract( uv );
		float g0x = g0( fuv.x );
		float g1x = g1( fuv.x );
		float h0x = h0( fuv.x );
		float h1x = h1( fuv.x );
		float h0y = h0( fuv.y );
		float h1y = h1( fuv.y );
		vec2 p0 = ( vec2( iuv.x + h0x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p1 = ( vec2( iuv.x + h1x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p2 = ( vec2( iuv.x + h0x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		vec2 p3 = ( vec2( iuv.x + h1x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		return g0( fuv.y ) * ( g0x * textureLod( tex, p0, lod ) + g1x * textureLod( tex, p1, lod ) ) +
			g1( fuv.y ) * ( g0x * textureLod( tex, p2, lod ) + g1x * textureLod( tex, p3, lod ) );
	}
	vec4 textureBicubic( sampler2D sampler, vec2 uv, float lod ) {
		vec2 fLodSize = vec2( textureSize( sampler, int( lod ) ) );
		vec2 cLodSize = vec2( textureSize( sampler, int( lod + 1.0 ) ) );
		vec2 fLodSizeInv = 1.0 / fLodSize;
		vec2 cLodSizeInv = 1.0 / cLodSize;
		vec4 fSample = bicubic( sampler, uv, vec4( fLodSizeInv, fLodSize ), floor( lod ) );
		vec4 cSample = bicubic( sampler, uv, vec4( cLodSizeInv, cLodSize ), ceil( lod ) );
		return mix( fSample, cSample, fract( lod ) );
	}
	vec3 getVolumeTransmissionRay( const in vec3 n, const in vec3 v, const in float thickness, const in float ior, const in mat4 modelMatrix ) {
		vec3 refractionVector = refract( - v, normalize( n ), 1.0 / ior );
		vec3 modelScale;
		modelScale.x = length( vec3( modelMatrix[ 0 ].xyz ) );
		modelScale.y = length( vec3( modelMatrix[ 1 ].xyz ) );
		modelScale.z = length( vec3( modelMatrix[ 2 ].xyz ) );
		return normalize( refractionVector ) * thickness * modelScale;
	}
	float applyIorToRoughness( const in float roughness, const in float ior ) {
		return roughness * clamp( ior * 2.0 - 2.0, 0.0, 1.0 );
	}
	vec4 getTransmissionSample( const in vec2 fragCoord, const in float roughness, const in float ior ) {
		float lod = log2( transmissionSamplerSize.x ) * applyIorToRoughness( roughness, ior );
		return textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );
	}
	vec3 volumeAttenuation( const in float transmissionDistance, const in vec3 attenuationColor, const in float attenuationDistance ) {
		if ( isinf( attenuationDistance ) ) {
			return vec3( 1.0 );
		} else {
			vec3 attenuationCoefficient = -log( attenuationColor ) / attenuationDistance;
			vec3 transmittance = exp( - attenuationCoefficient * transmissionDistance );			return transmittance;
		}
	}
	vec4 getIBLVolumeRefraction( const in vec3 n, const in vec3 v, const in float roughness, const in vec3 diffuseColor,
		const in vec3 specularColor, const in float specularF90, const in vec3 position, const in mat4 modelMatrix,
		const in mat4 viewMatrix, const in mat4 projMatrix, const in float dispersion, const in float ior, const in float thickness,
		const in vec3 attenuationColor, const in float attenuationDistance ) {
		vec4 transmittedLight;
		vec3 transmittance;
		#ifdef USE_DISPERSION
			float halfSpread = ( ior - 1.0 ) * 0.025 * dispersion;
			vec3 iors = vec3( ior - halfSpread, ior, ior + halfSpread );
			for ( int i = 0; i < 3; i ++ ) {
				vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, iors[ i ], modelMatrix );
				vec3 refractedRayExit = position + transmissionRay;
				vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
				vec2 refractionCoords = ndcPos.xy / ndcPos.w;
				refractionCoords += 1.0;
				refractionCoords /= 2.0;
				vec4 transmissionSample = getTransmissionSample( refractionCoords, roughness, iors[ i ] );
				transmittedLight[ i ] = transmissionSample[ i ];
				transmittedLight.a += transmissionSample.a;
				transmittance[ i ] = diffuseColor[ i ] * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance )[ i ];
			}
			transmittedLight.a /= 3.0;
		#else
			vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, ior, modelMatrix );
			vec3 refractedRayExit = position + transmissionRay;
			vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
			vec2 refractionCoords = ndcPos.xy / ndcPos.w;
			refractionCoords += 1.0;
			refractionCoords /= 2.0;
			transmittedLight = getTransmissionSample( refractionCoords, roughness, ior );
			transmittance = diffuseColor * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance );
		#endif
		vec3 attenuatedColor = transmittance * transmittedLight.rgb;
		vec3 F = EnvironmentBRDF( n, v, specularColor, specularF90, roughness );
		float transmittanceFactor = ( transmittance.r + transmittance.g + transmittance.b ) / 3.0;
		return vec4( ( 1.0 - F ) * attenuatedColor, 1.0 - ( 1.0 - transmittedLight.a ) * transmittanceFactor );
	}
#endif`,Cl=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_SPECULARMAP
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,Ll=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	uniform mat3 mapTransform;
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	uniform mat3 alphaMapTransform;
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	uniform mat3 lightMapTransform;
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	uniform mat3 aoMapTransform;
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	uniform mat3 bumpMapTransform;
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	uniform mat3 normalMapTransform;
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_DISPLACEMENTMAP
	uniform mat3 displacementMapTransform;
	varying vec2 vDisplacementMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	uniform mat3 emissiveMapTransform;
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	uniform mat3 metalnessMapTransform;
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	uniform mat3 roughnessMapTransform;
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	uniform mat3 anisotropyMapTransform;
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	uniform mat3 clearcoatMapTransform;
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform mat3 clearcoatNormalMapTransform;
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform mat3 clearcoatRoughnessMapTransform;
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	uniform mat3 sheenColorMapTransform;
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	uniform mat3 sheenRoughnessMapTransform;
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	uniform mat3 iridescenceMapTransform;
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform mat3 iridescenceThicknessMapTransform;
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SPECULARMAP
	uniform mat3 specularMapTransform;
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	uniform mat3 specularColorMapTransform;
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	uniform mat3 specularIntensityMapTransform;
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,Pl=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	vUv = vec3( uv, 1 ).xy;
#endif
#ifdef USE_MAP
	vMapUv = ( mapTransform * vec3( MAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ALPHAMAP
	vAlphaMapUv = ( alphaMapTransform * vec3( ALPHAMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_LIGHTMAP
	vLightMapUv = ( lightMapTransform * vec3( LIGHTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_AOMAP
	vAoMapUv = ( aoMapTransform * vec3( AOMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_BUMPMAP
	vBumpMapUv = ( bumpMapTransform * vec3( BUMPMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_NORMALMAP
	vNormalMapUv = ( normalMapTransform * vec3( NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_DISPLACEMENTMAP
	vDisplacementMapUv = ( displacementMapTransform * vec3( DISPLACEMENTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_EMISSIVEMAP
	vEmissiveMapUv = ( emissiveMapTransform * vec3( EMISSIVEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_METALNESSMAP
	vMetalnessMapUv = ( metalnessMapTransform * vec3( METALNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ROUGHNESSMAP
	vRoughnessMapUv = ( roughnessMapTransform * vec3( ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ANISOTROPYMAP
	vAnisotropyMapUv = ( anisotropyMapTransform * vec3( ANISOTROPYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOATMAP
	vClearcoatMapUv = ( clearcoatMapTransform * vec3( CLEARCOATMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	vClearcoatNormalMapUv = ( clearcoatNormalMapTransform * vec3( CLEARCOAT_NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	vClearcoatRoughnessMapUv = ( clearcoatRoughnessMapTransform * vec3( CLEARCOAT_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCEMAP
	vIridescenceMapUv = ( iridescenceMapTransform * vec3( IRIDESCENCEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	vIridescenceThicknessMapUv = ( iridescenceThicknessMapTransform * vec3( IRIDESCENCE_THICKNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_COLORMAP
	vSheenColorMapUv = ( sheenColorMapTransform * vec3( SHEEN_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	vSheenRoughnessMapUv = ( sheenRoughnessMapTransform * vec3( SHEEN_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULARMAP
	vSpecularMapUv = ( specularMapTransform * vec3( SPECULARMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_COLORMAP
	vSpecularColorMapUv = ( specularColorMapTransform * vec3( SPECULAR_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	vSpecularIntensityMapUv = ( specularIntensityMapTransform * vec3( SPECULAR_INTENSITYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_TRANSMISSIONMAP
	vTransmissionMapUv = ( transmissionMapTransform * vec3( TRANSMISSIONMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_THICKNESSMAP
	vThicknessMapUv = ( thicknessMapTransform * vec3( THICKNESSMAP_UV, 1 ) ).xy;
#endif`,wl=`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif`;const Ul=`varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`,Dl=`uniform sampler2D t2D;
uniform float backgroundIntensity;
varying vec2 vUv;
void main() {
	vec4 texColor = texture2D( t2D, vUv );
	#ifdef DECODE_VIDEO_TEXTURE
		texColor = vec4( mix( pow( texColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), texColor.rgb * 0.0773993808, vec3( lessThanEqual( texColor.rgb, vec3( 0.04045 ) ) ) ), texColor.w );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,Il=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,Nl=`#ifdef ENVMAP_TYPE_CUBE
	uniform samplerCube envMap;
#elif defined( ENVMAP_TYPE_CUBE_UV )
	uniform sampler2D envMap;
#endif
uniform float backgroundBlurriness;
uniform float backgroundIntensity;
uniform mat3 backgroundRotation;
varying vec3 vWorldDirection;
#include <cube_uv_reflection_fragment>
void main() {
	#ifdef ENVMAP_TYPE_CUBE
		vec4 texColor = textureCube( envMap, backgroundRotation * vWorldDirection );
	#elif defined( ENVMAP_TYPE_CUBE_UV )
		vec4 texColor = textureCubeUV( envMap, backgroundRotation * vWorldDirection, backgroundBlurriness );
	#else
		vec4 texColor = vec4( 0.0, 0.0, 0.0, 1.0 );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,yl=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,Ol=`uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;
varying vec3 vWorldDirection;
void main() {
	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );
	gl_FragColor = texColor;
	gl_FragColor.a *= opacity;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,Fl=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
varying vec2 vHighPrecisionZW;
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vHighPrecisionZW = gl_Position.zw;
}`,Bl=`#if DEPTH_PACKING == 3200
	uniform float opacity;
#endif
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
varying vec2 vHighPrecisionZW;
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#if DEPTH_PACKING == 3200
		diffuseColor.a = opacity;
	#endif
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <logdepthbuf_fragment>
	#ifdef USE_REVERSED_DEPTH_BUFFER
		float fragCoordZ = vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ];
	#else
		float fragCoordZ = 0.5 * vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ] + 0.5;
	#endif
	#if DEPTH_PACKING == 3200
		gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );
	#elif DEPTH_PACKING == 3201
		gl_FragColor = packDepthToRGBA( fragCoordZ );
	#elif DEPTH_PACKING == 3202
		gl_FragColor = vec4( packDepthToRGB( fragCoordZ ), 1.0 );
	#elif DEPTH_PACKING == 3203
		gl_FragColor = vec4( packDepthToRG( fragCoordZ ), 0.0, 1.0 );
	#endif
}`,Gl=`#define DISTANCE
varying vec3 vWorldPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <worldpos_vertex>
	#include <clipping_planes_vertex>
	vWorldPosition = worldPosition.xyz;
}`,Hl=`#define DISTANCE
uniform vec3 referencePosition;
uniform float nearDistance;
uniform float farDistance;
varying vec3 vWorldPosition;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	float dist = length( vWorldPosition - referencePosition );
	dist = ( dist - nearDistance ) / ( farDistance - nearDistance );
	dist = saturate( dist );
	gl_FragColor = vec4( dist, 0.0, 0.0, 1.0 );
}`,Vl=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
}`,kl=`uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,Wl=`uniform float scale;
attribute float lineDistance;
varying float vLineDistance;
#include <common>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	vLineDistance = scale * lineDistance;
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,zl=`uniform vec3 diffuse;
uniform float opacity;
uniform float dashSize;
uniform float totalSize;
varying float vLineDistance;
#include <common>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	if ( mod( vLineDistance, totalSize ) > dashSize ) {
		discard;
	}
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,Xl=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinbase_vertex>
		#include <skinnormal_vertex>
		#include <defaultnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <fog_vertex>
}`,Kl=`uniform vec3 diffuse;
uniform float opacity;
#ifndef FLAT_SHADED
	varying vec3 vNormal;
#endif
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		reflectedLight.indirectDiffuse += lightMapTexel.rgb * lightMapIntensity * RECIPROCAL_PI;
	#else
		reflectedLight.indirectDiffuse += vec3( 1.0 );
	#endif
	#include <aomap_fragment>
	reflectedLight.indirectDiffuse *= diffuseColor.rgb;
	vec3 outgoingLight = reflectedLight.indirectDiffuse;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,Yl=`#define LAMBERT
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,ql=`#define LAMBERT
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_lambert_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_lambert_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,Zl=`#define MATCAP
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <displacementmap_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
	vViewPosition = - mvPosition.xyz;
}`,$l=`#define MATCAP
uniform vec3 diffuse;
uniform float opacity;
uniform sampler2D matcap;
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	vec3 viewDir = normalize( vViewPosition );
	vec3 x = normalize( vec3( viewDir.z, 0.0, - viewDir.x ) );
	vec3 y = cross( viewDir, x );
	vec2 uv = vec2( dot( x, normal ), dot( y, normal ) ) * 0.495 + 0.5;
	#ifdef USE_MATCAP
		vec4 matcapColor = texture2D( matcap, uv );
	#else
		vec4 matcapColor = vec4( vec3( mix( 0.2, 0.8, uv.y ) ), 1.0 );
	#endif
	vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,jl=`#define NORMAL
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	vViewPosition = - mvPosition.xyz;
#endif
}`,Ql=`#define NORMAL
uniform float opacity;
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <uv_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 0.0, 0.0, 0.0, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	gl_FragColor = vec4( normalize( normal ) * 0.5 + 0.5, diffuseColor.a );
	#ifdef OPAQUE
		gl_FragColor.a = 1.0;
	#endif
}`,Jl=`#define PHONG
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,ef=`#define PHONG
uniform vec3 diffuse;
uniform vec3 emissive;
uniform vec3 specular;
uniform float shininess;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_phong_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_phong_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,tf=`#define STANDARD
varying vec3 vViewPosition;
#ifdef USE_TRANSMISSION
	varying vec3 vWorldPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
#ifdef USE_TRANSMISSION
	vWorldPosition = worldPosition.xyz;
#endif
}`,nf=`#define STANDARD
#ifdef PHYSICAL
	#define IOR
	#define USE_SPECULAR
#endif
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float roughness;
uniform float metalness;
uniform float opacity;
#ifdef IOR
	uniform float ior;
#endif
#ifdef USE_SPECULAR
	uniform float specularIntensity;
	uniform vec3 specularColor;
	#ifdef USE_SPECULAR_COLORMAP
		uniform sampler2D specularColorMap;
	#endif
	#ifdef USE_SPECULAR_INTENSITYMAP
		uniform sampler2D specularIntensityMap;
	#endif
#endif
#ifdef USE_CLEARCOAT
	uniform float clearcoat;
	uniform float clearcoatRoughness;
#endif
#ifdef USE_DISPERSION
	uniform float dispersion;
#endif
#ifdef USE_RETROREFLECTION
	uniform float retroreflectivity;
#endif
#ifdef USE_IRIDESCENCE
	uniform float iridescence;
	uniform float iridescenceIOR;
	uniform float iridescenceThicknessMinimum;
	uniform float iridescenceThicknessMaximum;
#endif
#ifdef USE_SHEEN
	uniform vec3 sheenColor;
	uniform float sheenRoughness;
	#ifdef USE_SHEEN_COLORMAP
		uniform sampler2D sheenColorMap;
	#endif
	#ifdef USE_SHEEN_ROUGHNESSMAP
		uniform sampler2D sheenRoughnessMap;
	#endif
#endif
#ifdef USE_ANISOTROPY
	uniform vec2 anisotropyVector;
	#ifdef USE_ANISOTROPYMAP
		uniform sampler2D anisotropyMap;
	#endif
#endif
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <iridescence_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_physical_pars_fragment>
#include <transmission_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <clearcoat_pars_fragment>
#include <iridescence_pars_fragment>
#include <roughnessmap_pars_fragment>
#include <metalnessmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <roughnessmap_fragment>
	#include <metalnessmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <clearcoat_normal_fragment_begin>
	#include <clearcoat_normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_physical_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
	vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
	#include <transmission_fragment>
	vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
	#ifdef USE_SHEEN
 
		outgoingLight = outgoingLight + sheenSpecularDirect + sheenSpecularIndirect;
 
 	#endif
	#ifdef USE_CLEARCOAT
		float dotNVcc = saturate( dot( geometryClearcoatNormal, geometryViewDir ) );
		vec3 Fcc = F_Schlick( material.clearcoatF0, material.clearcoatF90, dotNVcc );
		outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc ) + ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat;
	#endif
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,rf=`#define TOON
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,af=`#define TOON
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <gradientmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_toon_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_toon_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,of=`uniform float size;
uniform float scale;
#include <common>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
#ifdef USE_POINTS_UV
	varying vec2 vUv;
	uniform mat3 uvTransform;
#endif
void main() {
	#ifdef USE_POINTS_UV
		vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	#endif
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	gl_PointSize = size;
	#ifdef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) gl_PointSize *= ( scale / - mvPosition.z );
	#endif
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <fog_vertex>
}`,sf=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <color_pars_fragment>
#include <map_particle_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_particle_fragment>
	#include <color_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,cf=`#include <common>
#include <batching_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <shadowmap_pars_vertex>
void main() {
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,lf=`uniform vec3 color;
uniform float opacity;
#include <common>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <logdepthbuf_pars_fragment>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
void main() {
	#include <logdepthbuf_fragment>
	gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,ff=`uniform float rotation;
uniform vec2 center;
#include <common>
#include <uv_pars_vertex>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	vec4 mvPosition = modelViewMatrix[ 3 ];
	vec2 scale = vec2( length( modelMatrix[ 0 ].xyz ), length( modelMatrix[ 1 ].xyz ) );
	#ifndef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) scale *= - mvPosition.z;
	#endif
	vec2 alignedPosition = ( position.xy - ( center - vec2( 0.5 ) ) ) * scale;
	vec2 rotatedPosition;
	rotatedPosition.x = cos( rotation ) * alignedPosition.x - sin( rotation ) * alignedPosition.y;
	rotatedPosition.y = sin( rotation ) * alignedPosition.x + cos( rotation ) * alignedPosition.y;
	mvPosition.xy += rotatedPosition;
	gl_Position = projectionMatrix * mvPosition;
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,uf=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`,we={alphahash_fragment:Us,alphahash_pars_fragment:Ds,alphamap_fragment:Is,alphamap_pars_fragment:Ns,alphatest_fragment:ys,alphatest_pars_fragment:Os,aomap_fragment:Fs,aomap_pars_fragment:Bs,batching_pars_vertex:Gs,batching_vertex:Hs,begin_vertex:Vs,beginnormal_vertex:ks,bsdfs:Ws,iridescence_fragment:zs,bumpmap_pars_fragment:Xs,clipping_planes_fragment:Ks,clipping_planes_pars_fragment:Ys,clipping_planes_pars_vertex:qs,clipping_planes_vertex:Zs,color_fragment:$s,color_pars_fragment:js,color_pars_vertex:Qs,color_vertex:Js,common:ec,cube_uv_reflection_fragment:tc,defaultnormal_vertex:nc,displacementmap_pars_vertex:ic,displacementmap_vertex:rc,emissivemap_fragment:ac,emissivemap_pars_fragment:oc,colorspace_fragment:sc,colorspace_pars_fragment:cc,envmap_fragment:lc,envmap_common_pars_fragment:fc,envmap_pars_fragment:uc,envmap_pars_vertex:dc,envmap_physical_pars_fragment:Tc,envmap_vertex:pc,fog_vertex:hc,fog_pars_vertex:mc,fog_fragment:_c,fog_pars_fragment:gc,gradientmap_pars_fragment:vc,lightmap_pars_fragment:Sc,lights_lambert_fragment:Ec,lights_lambert_pars_fragment:xc,lights_pars_begin:Mc,lights_toon_fragment:Ac,lights_toon_pars_fragment:Rc,lights_phong_fragment:bc,lights_phong_pars_fragment:Cc,lights_physical_fragment:Lc,lights_physical_pars_fragment:Pc,lights_fragment_begin:wc,lights_fragment_maps:Uc,lights_fragment_end:Dc,lightprobes_pars_fragment:Ic,logdepthbuf_fragment:Nc,logdepthbuf_pars_fragment:yc,logdepthbuf_pars_vertex:Oc,logdepthbuf_vertex:Fc,map_fragment:Bc,map_pars_fragment:Gc,map_particle_fragment:Hc,map_particle_pars_fragment:Vc,metalnessmap_fragment:kc,metalnessmap_pars_fragment:Wc,morphinstance_vertex:zc,morphcolor_vertex:Xc,morphnormal_vertex:Kc,morphtarget_pars_vertex:Yc,morphtarget_vertex:qc,normal_fragment_begin:Zc,normal_fragment_maps:$c,normal_pars_fragment:jc,normal_pars_vertex:Qc,normal_vertex:Jc,normalmap_pars_fragment:el,clearcoat_normal_fragment_begin:tl,clearcoat_normal_fragment_maps:nl,clearcoat_pars_fragment:il,iridescence_pars_fragment:rl,opaque_fragment:al,packing:ol,premultiplied_alpha_fragment:sl,project_vertex:cl,dithering_fragment:ll,dithering_pars_fragment:fl,roughnessmap_fragment:ul,roughnessmap_pars_fragment:dl,shadowmap_pars_fragment:pl,shadowmap_pars_vertex:hl,shadowmap_vertex:ml,shadowmask_pars_fragment:_l,skinbase_vertex:gl,skinning_pars_vertex:vl,skinning_vertex:Sl,skinnormal_vertex:El,specularmap_fragment:xl,specularmap_pars_fragment:Ml,tonemapping_fragment:Tl,tonemapping_pars_fragment:Al,transmission_fragment:Rl,transmission_pars_fragment:bl,uv_pars_fragment:Cl,uv_pars_vertex:Ll,uv_vertex:Pl,worldpos_vertex:wl,background_vert:Ul,background_frag:Dl,backgroundCube_vert:Il,backgroundCube_frag:Nl,cube_vert:yl,cube_frag:Ol,depth_vert:Fl,depth_frag:Bl,distance_vert:Gl,distance_frag:Hl,equirect_vert:Vl,equirect_frag:kl,linedashed_vert:Wl,linedashed_frag:zl,meshbasic_vert:Xl,meshbasic_frag:Kl,meshlambert_vert:Yl,meshlambert_frag:ql,meshmatcap_vert:Zl,meshmatcap_frag:$l,meshnormal_vert:jl,meshnormal_frag:Ql,meshphong_vert:Jl,meshphong_frag:ef,meshphysical_vert:tf,meshphysical_frag:nf,meshtoon_vert:rf,meshtoon_frag:af,points_vert:of,points_frag:sf,shadow_vert:cf,shadow_frag:lf,sprite_vert:ff,sprite_frag:uf},le={common:{diffuse:{value:new He(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:new Fe},alphaMap:{value:null},alphaMapTransform:{value:new Fe},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:new Fe}},envmap:{envMap:{value:null},envMapRotation:{value:new Fe},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:.98},dfgLUT:{value:null}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:new Fe}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:new Fe}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:new Fe},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:new Fe},normalScale:{value:new _t(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:new Fe},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:new Fe}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:new Fe}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:new Fe}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:new He(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},sunLights:{value:[],properties:{direction:{},color:{}}},sunLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},sunShadowMatrix:{value:[]},sunShadowCascade:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null},probesSH:{value:null},probesMin:{value:new Le},probesMax:{value:new Le},probesResolution:{value:new Le}},points:{diffuse:{value:new He(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:new Fe},alphaTest:{value:0},uvTransform:{value:new Fe}},sprite:{diffuse:{value:new He(16777215)},opacity:{value:1},center:{value:new _t(.5,.5)},rotation:{value:0},map:{value:null},mapTransform:{value:new Fe},alphaMap:{value:null},alphaMapTransform:{value:new Fe},alphaTest:{value:0}}},Ut={basic:{uniforms:St([le.common,le.specularmap,le.envmap,le.aomap,le.lightmap,le.fog]),vertexShader:we.meshbasic_vert,fragmentShader:we.meshbasic_frag},lambert:{uniforms:St([le.common,le.specularmap,le.envmap,le.aomap,le.lightmap,le.emissivemap,le.bumpmap,le.normalmap,le.displacementmap,le.fog,le.lights,{emissive:{value:new He(0)},envMapIntensity:{value:1}}]),vertexShader:we.meshlambert_vert,fragmentShader:we.meshlambert_frag},phong:{uniforms:St([le.common,le.specularmap,le.envmap,le.aomap,le.lightmap,le.emissivemap,le.bumpmap,le.normalmap,le.displacementmap,le.fog,le.lights,{emissive:{value:new He(0)},specular:{value:new He(1118481)},shininess:{value:30},envMapIntensity:{value:1}}]),vertexShader:we.meshphong_vert,fragmentShader:we.meshphong_frag},standard:{uniforms:St([le.common,le.envmap,le.aomap,le.lightmap,le.emissivemap,le.bumpmap,le.normalmap,le.displacementmap,le.roughnessmap,le.metalnessmap,le.fog,le.lights,{emissive:{value:new He(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:we.meshphysical_vert,fragmentShader:we.meshphysical_frag},toon:{uniforms:St([le.common,le.aomap,le.lightmap,le.emissivemap,le.bumpmap,le.normalmap,le.displacementmap,le.gradientmap,le.fog,le.lights,{emissive:{value:new He(0)}}]),vertexShader:we.meshtoon_vert,fragmentShader:we.meshtoon_frag},matcap:{uniforms:St([le.common,le.bumpmap,le.normalmap,le.displacementmap,le.fog,{matcap:{value:null}}]),vertexShader:we.meshmatcap_vert,fragmentShader:we.meshmatcap_frag},points:{uniforms:St([le.points,le.fog]),vertexShader:we.points_vert,fragmentShader:we.points_frag},dashed:{uniforms:St([le.common,le.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:we.linedashed_vert,fragmentShader:we.linedashed_frag},depth:{uniforms:St([le.common,le.displacementmap]),vertexShader:we.depth_vert,fragmentShader:we.depth_frag},normal:{uniforms:St([le.common,le.bumpmap,le.normalmap,le.displacementmap,{opacity:{value:1}}]),vertexShader:we.meshnormal_vert,fragmentShader:we.meshnormal_frag},sprite:{uniforms:St([le.sprite,le.fog]),vertexShader:we.sprite_vert,fragmentShader:we.sprite_frag},background:{uniforms:{uvTransform:{value:new Fe},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:we.background_vert,fragmentShader:we.background_frag},backgroundCube:{uniforms:{envMap:{value:null},backgroundBlurriness:{value:0},backgroundIntensity:{value:1},backgroundRotation:{value:new Fe}},vertexShader:we.backgroundCube_vert,fragmentShader:we.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:we.cube_vert,fragmentShader:we.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:we.equirect_vert,fragmentShader:we.equirect_frag},distance:{uniforms:St([le.common,le.displacementmap,{referencePosition:{value:new Le},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:we.distance_vert,fragmentShader:we.distance_frag},shadow:{uniforms:St([le.lights,le.fog,{color:{value:new He(0)},opacity:{value:1}}]),vertexShader:we.shadow_vert,fragmentShader:we.shadow_frag}};Ut.physical={uniforms:St([Ut.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:new Fe},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:new Fe},clearcoatNormalScale:{value:new _t(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:new Fe},dispersion:{value:0},retroreflectivity:{value:0},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:new Fe},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:new Fe},sheen:{value:0},sheenColor:{value:new He(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:new Fe},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:new Fe},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:new Fe},transmissionSamplerSize:{value:new _t},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:new Fe},attenuationDistance:{value:0},attenuationColor:{value:new He(0)},specularColor:{value:new He(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:new Fe},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:new Fe},anisotropyVector:{value:new _t},anisotropyMap:{value:null},anisotropyMapTransform:{value:new Fe}}]),vertexShader:we.meshphysical_vert,fragmentShader:we.meshphysical_frag};const Pn={r:0,b:0,g:0},df=new yt,ba=new Fe;ba.set(-1,0,0,0,1,0,0,0,1);function pf(e,n,t,i,a,r){const o=new He(0);let c=a===!0?0:1,l,d,_=null,g=0,p=null;function v(P){let F=P.isScene===!0?P.background:null;if(F&&F.isTexture){const E=P.backgroundBlurriness>0;F=n.get(F,E)}return F}function A(P){let F=!1;const E=v(P);E===null?h(o,c):E&&E.isColor&&(h(E,1),F=!0);const M=e.xr.getEnvironmentBlendMode();M==="additive"?t.buffers.color.setClear(0,0,0,1,r):M==="alpha-blend"&&t.buffers.color.setClear(0,0,0,0,r),(e.autoClear||F)&&(t.buffers.depth.setTest(!0),t.buffers.depth.setMask(!0),t.buffers.color.setMask(!0),e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil))}function U(P,F){const E=v(F);E&&(E.isCubeTexture||E.mapping===Gn)?(d===void 0&&(d=new Ot(new Ei(1,1,1),new kt({name:"BackgroundCubeMaterial",uniforms:ci(Ut.backgroundCube.uniforms),vertexShader:Ut.backgroundCube.vertexShader,fragmentShader:Ut.backgroundCube.fragmentShader,side:xt,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),d.geometry.deleteAttribute("normal"),d.geometry.deleteAttribute("uv"),d.onBeforeRender=function(M,x,L){this.matrixWorld.copyPosition(L.matrixWorld)},Object.defineProperty(d.material,"envMap",{get:function(){return this.uniforms.envMap.value}}),i.update(d)),d.material.uniforms.envMap.value=E,d.material.uniforms.backgroundBlurriness.value=F.backgroundBlurriness,d.material.uniforms.backgroundIntensity.value=F.backgroundIntensity,d.material.uniforms.backgroundRotation.value.setFromMatrix4(df.makeRotationFromEuler(F.backgroundRotation)).transpose(),E.isCubeTexture&&E.isRenderTargetTexture===!1&&d.material.uniforms.backgroundRotation.value.premultiply(ba),d.material.toneMapped=tt.getTransfer(E.colorSpace)!==Qe,(_!==E||g!==E.version||p!==e.toneMapping)&&(d.material.needsUpdate=!0,_=E,g=E.version,p=e.toneMapping),d.layers.enableAll(),P.unshift(d,d.geometry,d.material,0,0,null)):E&&E.isTexture&&(l===void 0&&(l=new Ot(new aa(2,2),new kt({name:"BackgroundMaterial",uniforms:ci(Ut.background.uniforms),vertexShader:Ut.background.vertexShader,fragmentShader:Ut.background.fragmentShader,side:un,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),l.geometry.deleteAttribute("normal"),Object.defineProperty(l.material,"map",{get:function(){return this.uniforms.t2D.value}}),i.update(l)),l.material.uniforms.t2D.value=E,l.material.uniforms.backgroundIntensity.value=F.backgroundIntensity,l.material.toneMapped=tt.getTransfer(E.colorSpace)!==Qe,E.matrixAutoUpdate===!0&&E.updateMatrix(),l.material.uniforms.uvTransform.value.copy(E.matrix),(_!==E||g!==E.version||p!==e.toneMapping)&&(l.material.needsUpdate=!0,_=E,g=E.version,p=e.toneMapping),l.layers.enableAll(),P.unshift(l,l.geometry,l.material,0,0,null))}function h(P,F){P.getRGB(Pn,oa(e)),t.buffers.color.setClear(Pn.r,Pn.g,Pn.b,F,r)}function f(){d!==void 0&&(d.geometry.dispose(),d.material.dispose(),d=void 0),l!==void 0&&(l.geometry.dispose(),l.material.dispose(),l=void 0)}return{getClearColor:function(){return o},setClearColor:function(P,F=1){o.set(P),c=F,h(o,c)},getClearAlpha:function(){return c},setClearAlpha:function(P){c=P,h(o,c)},render:A,addToRenderList:U,dispose:f}}function hf(e,n){const t=e.getParameter(e.MAX_VERTEX_ATTRIBS),i={},a=p(null);let r=a,o=!1;function c(G,k,q,N,K){let j=!1;const Y=g(G,N,q,k);r!==Y&&(r=Y,d(r.object)),j=v(G,N,q,K),j&&A(G,N,q,K),K!==null&&n.update(K,e.ELEMENT_ARRAY_BUFFER),(j||o)&&(o=!1,E(G,k,q,N),K!==null&&e.bindBuffer(e.ELEMENT_ARRAY_BUFFER,n.get(K).buffer))}function l(){return e.createVertexArray()}function d(G){return e.bindVertexArray(G)}function _(G){return e.deleteVertexArray(G)}function g(G,k,q,N){const K=N.wireframe===!0;let j=i[k.id];j===void 0&&(j={},i[k.id]=j);const Y=G.isInstancedMesh===!0?G.id:0;let ne=j[Y];ne===void 0&&(ne={},j[Y]=ne);let Z=ne[q.id];Z===void 0&&(Z={},ne[q.id]=Z);let J=Z[K];return J===void 0&&(J=p(l()),Z[K]=J),J}function p(G){const k=[],q=[],N=[];for(let K=0;K<t;K++)k[K]=0,q[K]=0,N[K]=0;return{geometry:null,program:null,wireframe:!1,newAttributes:k,enabledAttributes:q,attributeDivisors:N,object:G,attributes:{},index:null}}function v(G,k,q,N){const K=r.attributes,j=k.attributes;let Y=0;const ne=q.getAttributes();for(const Z in ne)if(ne[Z].location>=0){const ee=K[Z];let be=j[Z];if(be===void 0&&(Z==="instanceMatrix"&&G.instanceMatrix&&(be=G.instanceMatrix),Z==="instanceColor"&&G.instanceColor&&(be=G.instanceColor)),ee===void 0||ee.attribute!==be||be&&ee.data!==be.data)return!0;Y++}return r.attributesNum!==Y||r.index!==N}function A(G,k,q,N){const K={},j=k.attributes;let Y=0;const ne=q.getAttributes();for(const Z in ne)if(ne[Z].location>=0){let ee=j[Z];ee===void 0&&(Z==="instanceMatrix"&&G.instanceMatrix&&(ee=G.instanceMatrix),Z==="instanceColor"&&G.instanceColor&&(ee=G.instanceColor));const be={};be.attribute=ee,ee&&ee.data&&(be.data=ee.data),K[Z]=be,Y++}r.attributes=K,r.attributesNum=Y,r.index=N}function U(){const G=r.newAttributes;for(let k=0,q=G.length;k<q;k++)G[k]=0}function h(G){f(G,0)}function f(G,k){const q=r.newAttributes,N=r.enabledAttributes,K=r.attributeDivisors;q[G]=1,N[G]===0&&(e.enableVertexAttribArray(G),N[G]=1),K[G]!==k&&(e.vertexAttribDivisor(G,k),K[G]=k)}function P(){const G=r.newAttributes,k=r.enabledAttributes;for(let q=0,N=k.length;q<N;q++)k[q]!==G[q]&&(e.disableVertexAttribArray(q),k[q]=0)}function F(G,k,q,N,K,j,Y){Y===!0?e.vertexAttribIPointer(G,k,q,K,j):e.vertexAttribPointer(G,k,q,N,K,j)}function E(G,k,q,N){U();const K=N.attributes,j=q.getAttributes(),Y=k.defaultAttributeValues;for(const ne in j){const Z=j[ne];if(Z.location>=0){let J=K[ne];if(J===void 0&&(ne==="instanceMatrix"&&G.instanceMatrix&&(J=G.instanceMatrix),ne==="instanceColor"&&G.instanceColor&&(J=G.instanceColor)),J!==void 0){const ee=J.normalized,be=J.itemSize,Re=n.get(J);if(Re===void 0)continue;const rt=Re.buffer,Xe=Re.type,Ke=Re.bytesPerElement,W=Xe===e.INT||Xe===e.UNSIGNED_INT||J.gpuType===la;if(J.isInterleavedBufferAttribute){const $=J.data,Ee=$.stride,Ue=J.offset;if($.isInstancedInterleavedBuffer){for(let me=0;me<Z.locationSize;me++)f(Z.location+me,$.meshPerAttribute);G.isInstancedMesh!==!0&&N._maxInstanceCount===void 0&&(N._maxInstanceCount=$.meshPerAttribute*$.count)}else for(let me=0;me<Z.locationSize;me++)h(Z.location+me);e.bindBuffer(e.ARRAY_BUFFER,rt);for(let me=0;me<Z.locationSize;me++)F(Z.location+me,be/Z.locationSize,Xe,ee,Ee*Ke,(Ue+be/Z.locationSize*me)*Ke,W)}else{if(J.isInstancedBufferAttribute){for(let $=0;$<Z.locationSize;$++)f(Z.location+$,J.meshPerAttribute);G.isInstancedMesh!==!0&&N._maxInstanceCount===void 0&&(N._maxInstanceCount=J.meshPerAttribute*J.count)}else for(let $=0;$<Z.locationSize;$++)h(Z.location+$);e.bindBuffer(e.ARRAY_BUFFER,rt);for(let $=0;$<Z.locationSize;$++)F(Z.location+$,be/Z.locationSize,Xe,ee,be*Ke,be/Z.locationSize*$*Ke,W)}}else if(Y!==void 0){const ee=Y[ne];if(ee!==void 0)switch(ee.length){case 2:e.vertexAttrib2fv(Z.location,ee);break;case 3:e.vertexAttrib3fv(Z.location,ee);break;case 4:e.vertexAttrib4fv(Z.location,ee);break;default:e.vertexAttrib1fv(Z.location,ee)}}}}P()}function M(){T();for(const G in i){const k=i[G];for(const q in k){const N=k[q];for(const K in N){const j=N[K];for(const Y in j)_(j[Y].object),delete j[Y];delete N[K]}}delete i[G]}}function x(G){if(i[G.id]===void 0)return;const k=i[G.id];for(const q in k){const N=k[q];for(const K in N){const j=N[K];for(const Y in j)_(j[Y].object),delete j[Y];delete N[K]}}delete i[G.id]}function L(G){for(const k in i){const q=i[k];for(const N in q){const K=q[N];if(K[G.id]===void 0)continue;const j=K[G.id];for(const Y in j)_(j[Y].object),delete j[Y];delete K[G.id]}}}function m(G){for(const k in i){const q=i[k],N=G.isInstancedMesh===!0?G.id:0,K=q[N];if(K!==void 0){for(const j in K){const Y=K[j];for(const ne in Y)_(Y[ne].object),delete Y[ne];delete K[j]}delete q[N],Object.keys(q).length===0&&delete i[k]}}}function T(){y(),o=!0,r!==a&&(r=a,d(r.object))}function y(){a.geometry=null,a.program=null,a.wireframe=!1}return{setup:c,reset:T,resetDefaultState:y,dispose:M,releaseStatesOfGeometry:x,releaseStatesOfObject:m,releaseStatesOfProgram:L,initAttributes:U,enableAttribute:h,disableUnusedAttributes:P}}function mf(e,n,t){let i;function a(l){i=l}function r(l,d){e.drawArrays(i,l,d),t.update(d,i,1)}function o(l,d,_){_!==0&&(e.drawArraysInstanced(i,l,d,_),t.update(d,i,_))}function c(l,d,_){if(_===0)return;n.get("WEBGL_multi_draw").multiDrawArraysWEBGL(i,l,0,d,0,_);let p=0;for(let v=0;v<_;v++)p+=d[v];t.update(p,i,1)}this.setMode=a,this.render=r,this.renderInstances=o,this.renderMultiDraw=c}function _f(e,n,t,i){let a;function r(){if(a!==void 0)return a;if(n.has("EXT_texture_filter_anisotropic")===!0){const L=n.get("EXT_texture_filter_anisotropic");a=e.getParameter(L.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}else a=0;return a}function o(L){return!(L!==Gt&&i.convert(L)!==e.getParameter(e.IMPLEMENTATION_COLOR_READ_FORMAT))}function c(L){const m=L===Vt&&(n.has("EXT_color_buffer_half_float")||n.has("EXT_color_buffer_float"));return!(L!==Dt&&L!==qt&&!m&&i.convert(L)!==e.getParameter(e.IMPLEMENTATION_COLOR_READ_TYPE))}function l(L){if(L==="highp"){if(e.getShaderPrecisionFormat(e.VERTEX_SHADER,e.HIGH_FLOAT).precision>0&&e.getShaderPrecisionFormat(e.FRAGMENT_SHADER,e.HIGH_FLOAT).precision>0)return"highp";L="mediump"}return L==="mediump"&&e.getShaderPrecisionFormat(e.VERTEX_SHADER,e.MEDIUM_FLOAT).precision>0&&e.getShaderPrecisionFormat(e.FRAGMENT_SHADER,e.MEDIUM_FLOAT).precision>0?"mediump":"lowp"}let d=t.precision!==void 0?t.precision:"highp";const _=l(d);_!==d&&(ze("WebGLRenderer:",d,"not supported, using",_,"instead."),d=_);const g=t.logarithmicDepthBuffer===!0,p=t.reversedDepthBuffer===!0&&n.has("EXT_clip_control");t.reversedDepthBuffer===!0&&p===!1&&ze("WebGLRenderer: Unable to use reversed depth buffer due to missing EXT_clip_control extension. Fallback to default depth buffer.");const v=e.getParameter(e.MAX_TEXTURE_IMAGE_UNITS),A=e.getParameter(e.MAX_VERTEX_TEXTURE_IMAGE_UNITS),U=e.getParameter(e.MAX_TEXTURE_SIZE),h=e.getParameter(e.MAX_CUBE_MAP_TEXTURE_SIZE),f=e.getParameter(e.MAX_VERTEX_ATTRIBS),P=e.getParameter(e.MAX_VERTEX_UNIFORM_VECTORS),F=e.getParameter(e.MAX_VARYING_VECTORS),E=e.getParameter(e.MAX_FRAGMENT_UNIFORM_VECTORS),M=e.getParameter(e.MAX_SAMPLES),x=e.getParameter(e.SAMPLES);return{isWebGL2:!0,getMaxAnisotropy:r,getMaxPrecision:l,textureFormatReadable:o,textureTypeReadable:c,precision:d,logarithmicDepthBuffer:g,reversedDepthBuffer:p,maxTextures:v,maxVertexTextures:A,maxTextureSize:U,maxCubemapSize:h,maxAttributes:f,maxVertexUniforms:P,maxVaryings:F,maxFragmentUniforms:E,maxSamples:M,samples:x}}function gf(e){const n=this;let t=null,i=0,a=!1,r=!1;const o=new _o,c=new Fe,l={value:null,needsUpdate:!1};this.uniform=l,this.numPlanes=0,this.numIntersection=0,this.init=function(g,p){const v=g.length!==0||p||i!==0||a;return a=p,i=g.length,v},this.beginShadows=function(){r=!0,_(null)},this.endShadows=function(){r=!1},this.setGlobalState=function(g,p){t=_(g,p,0)},this.setState=function(g,p,v){const A=g.clippingPlanes,U=g.clipIntersection,h=g.clipShadows,f=e.get(g);if(!a||A===null||A.length===0||r&&!h)r?_(null):d();else{const P=r?0:i,F=P*4;let E=f.clippingState||null;l.value=E,E=_(A,p,F,v);for(let M=0;M!==F;++M)E[M]=t[M];f.clippingState=E,this.numIntersection=U?this.numPlanes:0,this.numPlanes+=P}};function d(){l.value!==t&&(l.value=t,l.needsUpdate=i>0),n.numPlanes=i,n.numIntersection=0}function _(g,p,v,A){const U=g!==null?g.length:0;let h=null;if(U!==0){if(h=l.value,A!==!0||h===null){const f=v+U*4,P=p.matrixWorldInverse;c.getNormalMatrix(P),(h===null||h.length<f)&&(h=new Float32Array(f));for(let F=0,E=v;F!==U;++F,E+=4)o.copy(g[F]).applyMatrix4(P,c),o.normal.toArray(h,E),h[E+3]=o.constant}l.value=h,l.needsUpdate=!0}return n.numPlanes=U,n.numIntersection=0,h}}const cn=4,vf=6,Sf=20,Ef=256,gn=new Si,Mr=new He;let Jn=null,ei=0,ti=0,ni=!1;const xf=new Le,$t=new Le;class Tr{constructor(n){this._renderer=n,this._pingPongRenderTarget=null,this._lodMax=0,this._cubeSize=0,this._sizeLods=[],this._lodMeshes=[],this._backgroundBox=null,this._cubemapMaterial=null,this._equirectMaterial=null,this._blurMaterial=null,this._ggxMaterial=null}fromScene(n,t=0,i=.1,a=100,r={}){const{size:o=256,position:c=xf}=r;Jn=this._renderer.getRenderTarget(),ei=this._renderer.getActiveCubeFace(),ti=this._renderer.getActiveMipmapLevel(),ni=this._renderer.xr.enabled,this._renderer.xr.enabled=!1,this._setSize(o);const l=this._allocateTargets();return l.depthBuffer=!0,this._sceneToCubeUV(n,i,a,l,c),t>0&&this._blur(l,0,0,t),this._applyPMREM(l),this._cleanup(l),l}fromEquirectangular(n,t=null){return this._fromTexture(n,t)}fromCubemap(n,t=null){return this._fromTexture(n,t)}compileCubemapShader(){this._cubemapMaterial===null&&(this._cubemapMaterial=br(),this._compileMaterial(this._cubemapMaterial))}compileEquirectangularShader(){this._equirectMaterial===null&&(this._equirectMaterial=Rr(),this._compileMaterial(this._equirectMaterial))}dispose(){this._dispose(),this._cubemapMaterial!==null&&this._cubemapMaterial.dispose(),this._equirectMaterial!==null&&this._equirectMaterial.dispose(),this._backgroundBox!==null&&(this._backgroundBox.geometry.dispose(),this._backgroundBox.material.dispose())}_setSize(n){this._lodMax=Math.floor(Math.log2(n)),this._cubeSize=Math.pow(2,this._lodMax)}_dispose(){this._blurMaterial!==null&&this._blurMaterial.dispose(),this._ggxMaterial!==null&&this._ggxMaterial.dispose(),this._pingPongRenderTarget!==null&&this._pingPongRenderTarget.dispose();for(let n=0;n<this._lodMeshes.length;n++)this._lodMeshes[n].geometry.dispose()}_cleanup(n){this._renderer.setRenderTarget(Jn,ei,ti),this._renderer.xr.enabled=ni,n.scissorTest=!1,rn(n,0,0,n.width,n.height)}_fromTexture(n,t){n.mapping===bn||n.mapping===hn?this._setSize(n.image.length===0?16:n.image[0].width||n.image[0].image.width):this._setSize(n.image.width/4),Jn=this._renderer.getRenderTarget(),ei=this._renderer.getActiveCubeFace(),ti=this._renderer.getActiveMipmapLevel(),ni=this._renderer.xr.enabled,this._renderer.xr.enabled=!1;const i=t||this._allocateTargets();return this._textureToCubeUV(n,i),this._applyPMREM(i),this._cleanup(i),i}_allocateTargets(){const n=3*Math.max(this._cubeSize,112),t=4*this._cubeSize,i={magFilter:mt,minFilter:mt,generateMipmaps:!1,type:Vt,format:Gt,colorSpace:bt,depthBuffer:!1},a=Ar(n,t,i);if(this._pingPongRenderTarget===null||this._pingPongRenderTarget.width!==n||this._pingPongRenderTarget.height!==t){this._pingPongRenderTarget!==null&&this._dispose(),this._pingPongRenderTarget=Ar(n,t,i);const{_lodMax:r}=this;({lodMeshes:this._lodMeshes,sizeLods:this._sizeLods}=Mf(r)),this._blurMaterial=Af(r,n,t),this._ggxMaterial=Tf(r,n,t)}return a}_compileMaterial(n){const t=new Ot(new en,n);this._renderer.compile(t,gn)}_sceneToCubeUV(n,t,i,a,r){const l=new Tn(90,1,t,i),d=[1,-1,1,1,1,1],_=[1,1,1,-1,-1,-1],g=this._renderer,p=g.autoClear,v=g.toneMapping;g.getClearColor(Mr),g.toneMapping=Nt,g.autoClear=!1,g.state.buffers.depth.getReversed()&&(g.setRenderTarget(a),g.clearDepth(),g.setRenderTarget(null)),this._backgroundBox===null&&(this._backgroundBox=new Ot(new Ei,new sn({name:"PMREM.Background",side:xt,depthWrite:!1,depthTest:!1})));const U=this._backgroundBox,h=U.material;let f=!1;const P=n.background;P?P.isColor&&(h.color.copy(P),n.background=null,f=!0):(h.color.copy(Mr),f=!0);for(let F=0;F<6;F++){const E=F%3;E===0?(l.up.set(0,d[F],0),l.position.set(r.x,r.y,r.z),l.lookAt(r.x+_[F],r.y,r.z)):E===1?(l.up.set(0,0,d[F]),l.position.set(r.x,r.y,r.z),l.lookAt(r.x,r.y+_[F],r.z)):(l.up.set(0,d[F],0),l.position.set(r.x,r.y,r.z),l.lookAt(r.x,r.y,r.z+_[F]));const M=this._cubeSize;rn(a,E*M,F>2?M:0,M,M),g.setRenderTarget(a),f&&g.render(U,l),g.render(n,l)}g.toneMapping=v,g.autoClear=p,n.background=P}_textureToCubeUV(n,t){const i=this._renderer,a=n.mapping===bn||n.mapping===hn;a?(this._cubemapMaterial===null&&(this._cubemapMaterial=br()),this._cubemapMaterial.uniforms.flipEnvMap.value=n.isRenderTargetTexture===!1?-1:1):this._equirectMaterial===null&&(this._equirectMaterial=Rr());const r=a?this._cubemapMaterial:this._equirectMaterial,o=this._lodMeshes[0];o.material=r;const c=r.uniforms;c.envMap.value=n;const l=this._cubeSize;rn(t,0,0,3*l,2*l),i.setRenderTarget(t),i.render(o,gn)}_applyPMREM(n){const t=this._renderer,i=t.autoClear;t.autoClear=!1;const a=this._lodMeshes.length;for(let r=1;r<a;r++)this._applyGGXFilter(n,r-1,r);t.autoClear=i}_applyGGXFilter(n,t,i){const a=this._renderer,r=this._pingPongRenderTarget,o=this._ggxMaterial,c=this._lodMeshes[i];c.material=o;const l=o.uniforms,d=i/(this._lodMeshes.length-1),_=t/(this._lodMeshes.length-1),g=Math.sqrt(d*d-_*_),p=d*1.25,v=g*p,{_lodMax:A}=this,U=this._sizeLods[i],h=3*U*(i>A-cn?i-A+cn:0),f=4*(this._cubeSize-U);l.envMap.value=n.texture,l.roughness.value=v,l.mipInt.value=A-t,rn(r,h,f,3*U,2*U),a.setRenderTarget(r),a.render(c,gn),l.envMap.value=r.texture,l.roughness.value=0,l.mipInt.value=A-i,rn(n,h,f,3*U,2*U),a.setRenderTarget(n),a.render(c,gn)}_blur(n,t,i,a){const r=this._pingPongRenderTarget,o=Math.min(a,Math.PI)/Math.SQRT2;this._blurPass(n,r,t,i,o),this._blurPass(r,n,i,i,o)}_blurPass(n,t,i,a,r){const o=this._renderer,c=this._blurMaterial,l=this._lodMeshes[a];l.material=c;const d=c.uniforms;d.envMap.value=n.texture,d.sigma.value=r,d.mipInt.value=this._lodMax-i;const _=this._sizeLods[a],g=3*_*(a>this._lodMax-cn?a-this._lodMax+cn:0),p=4*(this._cubeSize-_);rn(t,g,p,3*_,2*_),o.setRenderTarget(t),o.render(l,gn)}}function Mf(e){const n=[],t=[];let i=e;const a=e-cn+1+vf;for(let r=0;r<a;r++){const o=Math.pow(2,i);n.push(o);const c=1/(o-2),l=-c,d=1+c,_=[l,l,d,l,d,d,l,l,d,d,l,d],g=6,p=6,v=3,A=new Float32Array(v*p*g),U=new Float32Array(v*p*g);for(let f=0;f<g;f++){const P=f%3*2/3-1,F=f>2?0:-1,E=[P,F,0,P+2/3,F,0,P+2/3,F+1,0,P,F,0,P+2/3,F+1,0,P,F+1,0];A.set(E,v*p*f);for(let M=0;M<p;M++){const x=_[M*2]*2-1,L=_[M*2+1]*2-1;f===0?$t.set(1,L,x):f===1?$t.set(-x,1,-L):f===2?$t.set(-x,L,1):f===3?$t.set(-1,L,-x):f===4?$t.set(-x,-1,L):$t.set(x,L,-1),$t.toArray(U,(f*p+M)*v)}}const h=new en;h.setAttribute("position",new Qt(A,v)),h.setAttribute("outputDirection",new Qt(U,v)),t.push(new Ot(h,null)),i>cn&&i--}return{lodMeshes:t,sizeLods:n}}function Ar(e,n,t){const i=new Rt(e,n,t);return i.texture.mapping=Gn,i.texture.name="PMREM.cubeUv",i.scissorTest=!0,i}function rn(e,n,t,i,a){e.viewport.set(n,t,i,a),e.scissor.set(n,t,i,a)}function Tf(e,n,t){return new kt({name:"PMREMGGXConvolution",defines:{GGX_SAMPLES:Ef,CUBEUV_TEXEL_WIDTH:1/n,CUBEUV_TEXEL_HEIGHT:1/t,CUBEUV_MAX_MIP:`${e}.0`},uniforms:{envMap:{value:null},roughness:{value:0},mipInt:{value:0}},vertexShader:Hn(),fragmentShader:`

			precision highp float;
			precision highp int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform float roughness;
			uniform float mipInt;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			#define PI 3.14159265359

			// Van der Corput radical inverse
			float radicalInverse_VdC(uint bits) {
				bits = (bits << 16u) | (bits >> 16u);
				bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
				bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
				bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
				bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
				return float(bits) * 2.3283064365386963e-10; // / 0x100000000
			}

			// Hammersley sequence
			vec2 hammersley(uint i, uint N) {
				return vec2(float(i) / float(N), radicalInverse_VdC(i));
			}

			// GGX VNDF importance sampling (Eric Heitz 2018)
			// "Sampling the GGX Distribution of Visible Normals"
			// https://jcgt.org/published/0007/04/01/
			vec3 importanceSampleGGX_VNDF(vec2 Xi, vec3 V, float roughness) {
				float alpha = roughness * roughness;

				// Section 4.1: Orthonormal basis
				vec3 T1 = vec3(1.0, 0.0, 0.0);
				vec3 T2 = cross(V, T1);

				// Section 4.2: Parameterization of projected area
				float r = sqrt(Xi.x);
				float phi = 2.0 * PI * Xi.y;
				float t1 = r * cos(phi);
				float t2 = r * sin(phi);
				float s = 0.5 * (1.0 + V.z);
				t2 = (1.0 - s) * sqrt(1.0 - t1 * t1) + s * t2;

				// Section 4.3: Reprojection onto hemisphere
				vec3 Nh = t1 * T1 + t2 * T2 + sqrt(max(0.0, 1.0 - t1 * t1 - t2 * t2)) * V;

				// Section 3.4: Transform back to ellipsoid configuration
				return normalize(vec3(alpha * Nh.x, alpha * Nh.y, max(0.0, Nh.z)));
			}

			void main() {
				vec3 N = normalize(vOutputDirection);
				vec3 V = N; // Assume view direction equals normal for pre-filtering

				vec3 prefilteredColor = vec3(0.0);
				float totalWeight = 0.0;

				// For very low roughness, just sample the environment directly
				if (roughness < 0.001) {
					gl_FragColor = vec4(bilinearCubeUV(envMap, N, mipInt), 1.0);
					return;
				}

				// Tangent space basis for VNDF sampling
				vec3 up = abs(N.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
				vec3 tangent = normalize(cross(up, N));
				vec3 bitangent = cross(N, tangent);

				for(uint i = 0u; i < uint(GGX_SAMPLES); i++) {
					vec2 Xi = hammersley(i, uint(GGX_SAMPLES));

					// For PMREM, V = N, so in tangent space V is always (0, 0, 1)
					vec3 H_tangent = importanceSampleGGX_VNDF(Xi, vec3(0.0, 0.0, 1.0), roughness);

					// Transform H back to world space
					vec3 H = normalize(tangent * H_tangent.x + bitangent * H_tangent.y + N * H_tangent.z);
					vec3 L = normalize(2.0 * dot(V, H) * H - V);

					float NdotL = max(dot(N, L), 0.0);

					if(NdotL > 0.0) {
						// Sample environment at fixed mip level
						// VNDF importance sampling handles the distribution filtering
						vec3 sampleColor = bilinearCubeUV(envMap, L, mipInt);

						// Weight by NdotL for the split-sum approximation
						// VNDF PDF naturally accounts for the visible microfacet distribution
						prefilteredColor += sampleColor * NdotL;
						totalWeight += NdotL;
					}
				}

				if (totalWeight > 0.0) {
					prefilteredColor = prefilteredColor / totalWeight;
				}

				gl_FragColor = vec4(prefilteredColor, 1.0);
			}
		`,blending:Ht,depthTest:!1,depthWrite:!1})}function Af(e,n,t){return new kt({name:"SphericalGaussianBlur",defines:{SAMPLES:Sf,CUBEUV_TEXEL_WIDTH:1/n,CUBEUV_TEXEL_HEIGHT:1/t,CUBEUV_MAX_MIP:`${e}.0`},uniforms:{envMap:{value:null},sigma:{value:0},mipInt:{value:0}},vertexShader:Hn(),fragmentShader:`

			precision highp float;
			precision highp int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform float sigma;
			uniform float mipInt;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			#define PI 3.14159265359
			#define GOLDEN_ANGLE 2.39996322973

			void main() {

				if ( sigma == 0.0 ) {

					gl_FragColor = vec4( bilinearCubeUV( envMap, vOutputDirection, mipInt ), 1.0 );
					return;

				}

				vec3 outputDirection = normalize( vOutputDirection );

				vec3 up = abs( outputDirection.z ) < 0.999 ? vec3( 0.0, 0.0, 1.0 ) : vec3( 1.0, 0.0, 0.0 );
				vec3 tangent = normalize( cross( up, outputDirection ) );
				vec3 bitangent = cross( outputDirection, tangent );

				// Truncate the kernel at three standard deviations or at the antipode.
				float thetaMax = min( 3.0 * sigma, PI );
				float truncation = 1.0 - exp( - 0.5 * thetaMax * thetaMax / ( sigma * sigma ) );

				vec3 accumColor = vec3( 0.0 );
				float accumWeight = 0.0;

				for ( int i = 0; i < SAMPLES; i ++ ) {

					// Stratified inverse-CDF sampling of the Gaussian, placed on a golden-angle spiral.
					float stratum = ( float( i ) + 0.5 ) / float( SAMPLES );
					float theta = sigma * sqrt( - 2.0 * log( 1.0 - stratum * truncation ) );
					float phi = float( i ) * GOLDEN_ANGLE;

					vec3 offset = cos( phi ) * tangent + sin( phi ) * bitangent;
					vec3 sampleDirection = cos( theta ) * outputDirection + sin( theta ) * offset;

					// Correct the planar sample density to solid angle.
					float weight = sin( theta ) / theta;

					accumColor += weight * bilinearCubeUV( envMap, sampleDirection, mipInt );
					accumWeight += weight;

				}

				gl_FragColor = vec4( accumColor / accumWeight, 1.0 );

			}
		`,blending:Ht,depthTest:!1,depthWrite:!1})}function Rr(){return new kt({name:"EquirectangularToCubeUV",uniforms:{envMap:{value:null}},vertexShader:Hn(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;

			#include <common>

			void main() {

				vec3 outputDirection = normalize( vOutputDirection );
				vec2 uv = equirectUv( outputDirection );

				gl_FragColor = vec4( texture2D ( envMap, uv ).rgb, 1.0 );

			}
		`,blending:Ht,depthTest:!1,depthWrite:!1})}function br(){return new kt({name:"CubemapToCubeUV",uniforms:{envMap:{value:null},flipEnvMap:{value:-1}},vertexShader:Hn(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			uniform float flipEnvMap;

			varying vec3 vOutputDirection;

			uniform samplerCube envMap;

			void main() {

				gl_FragColor = textureCube( envMap, vec3( flipEnvMap * vOutputDirection.x, vOutputDirection.yz ) );

			}
		`,blending:Ht,depthTest:!1,depthWrite:!1})}function Hn(){return`

		precision mediump float;
		precision mediump int;

		attribute vec3 outputDirection;

		varying vec3 vOutputDirection;

		void main() {

			vOutputDirection = outputDirection;
			gl_Position = vec4( position, 1.0 );

		}
	`}class Ca extends Rt{constructor(n=1,t={}){super(n,n,t),this.isWebGLCubeRenderTarget=!0;const i={width:n,height:n,depth:1},a=[i,i,i,i,i,i];this.texture=new sa(a),this._setTextureOptions(t),this.texture.isRenderTargetTexture=!0}fromEquirectangularTexture(n,t){this.texture.type=t.type,this.texture.colorSpace=t.colorSpace,this.texture.generateMipmaps=t.generateMipmaps,this.texture.minFilter=t.minFilter,this.texture.magFilter=t.magFilter;const i={uniforms:{tEquirect:{value:null}},vertexShader:`

				varying vec3 vWorldDirection;

				vec3 transformDirection( in vec3 dir, in mat4 matrix ) {

					return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );

				}

				void main() {

					vWorldDirection = transformDirection( position, modelMatrix );

					#include <begin_vertex>
					#include <project_vertex>

				}
			`,fragmentShader:`

				uniform sampler2D tEquirect;

				varying vec3 vWorldDirection;

				#include <common>

				void main() {

					vec3 direction = normalize( vWorldDirection );

					vec2 sampleUV = equirectUv( direction );

					gl_FragColor = texture2D( tEquirect, sampleUV );

				}
			`},a=new Ei(5,5,5),r=new kt({name:"CubemapFromEquirect",uniforms:ci(i.uniforms),vertexShader:i.vertexShader,fragmentShader:i.fragmentShader,side:xt,blending:Ht});r.uniforms.tEquirect.value=t;const o=new Ot(a,r),c=t.minFilter;return t.minFilter===Yt&&(t.minFilter=mt),new Go(1,10,this).update(n,o),t.minFilter=c,o.geometry.dispose(),o.material.dispose(),this}clear(n,t=!0,i=!0,a=!0){const r=n.getRenderTarget();for(let o=0;o<6;o++)n.setRenderTarget(this,o),n.clear(t,i,a);n.setRenderTarget(r)}}function Rf(e){let n=new WeakMap,t=new WeakMap,i=null;function a(p,v=!1){return p==null?null:v?o(p):r(p)}function r(p){if(p&&p.isTexture){const v=p.mapping;if(v===Zn||v===$n)if(n.has(p)){const A=n.get(p).texture;return c(A,p.mapping)}else{const A=p.image;if(A&&A.height>0){const U=new Ca(A.height);return U.fromEquirectangularTexture(e,p),n.set(p,U),p.addEventListener("dispose",d),c(U.texture,p.mapping)}else return null}}return p}function o(p){if(p&&p.isTexture){const v=p.mapping,A=v===Zn||v===$n,U=v===bn||v===hn;if(A||U){let h=t.get(p);const f=h!==void 0?h.texture.pmremVersion:0;if(p.isRenderTargetTexture&&p.pmremVersion!==f)return i===null&&(i=new Tr(e)),h=A?i.fromEquirectangular(p,h):i.fromCubemap(p,h),h.texture.pmremVersion=p.pmremVersion,t.set(p,h),h.texture;if(h!==void 0)return h.texture;{const P=p.image;return A&&P&&P.height>0||U&&P&&l(P)?(i===null&&(i=new Tr(e)),h=A?i.fromEquirectangular(p):i.fromCubemap(p),h.texture.pmremVersion=p.pmremVersion,t.set(p,h),p.addEventListener("dispose",_),h.texture):null}}}return p}function c(p,v){return v===Zn?p.mapping=bn:v===$n&&(p.mapping=hn),p}function l(p){let v=0;const A=6;for(let U=0;U<A;U++)p[U]!==void 0&&v++;return v===A}function d(p){const v=p.target;v.removeEventListener("dispose",d);const A=n.get(v);A!==void 0&&(n.delete(v),A.dispose())}function _(p){const v=p.target;v.removeEventListener("dispose",_);const A=t.get(v);A!==void 0&&(t.delete(v),A.dispose())}function g(){n=new WeakMap,t=new WeakMap,i!==null&&(i.dispose(),i=null)}return{get:a,dispose:g}}function bf(e){const n={};function t(i){if(n[i]!==void 0)return n[i];const a=e.getExtension(i);return n[i]=a,a}return{has:function(i){return t(i)!==null},init:function(){t("EXT_color_buffer_float"),t("WEBGL_clip_cull_distance"),t("OES_texture_float_linear"),t("EXT_color_buffer_half_float"),t("WEBGL_multisampled_render_to_texture"),t("WEBGL_render_shared_exponent")},get:function(i){const a=t(i);return a===null&&bo("WebGLRenderer: "+i+" extension not supported."),a}}}function Cf(e,n,t,i){const a={},r=new WeakMap;function o(g){const p=g.target;p.index!==null&&n.remove(p.index);for(const A in p.attributes)n.remove(p.attributes[A]);p.removeEventListener("dispose",o),delete a[p.id];const v=r.get(p);v&&(n.remove(v),r.delete(p)),i.releaseStatesOfGeometry(p),p.isInstancedBufferGeometry===!0&&delete p._maxInstanceCount,t.memory.geometries--}function c(g,p){return a[p.id]===!0||(p.addEventListener("dispose",o),a[p.id]=!0,t.memory.geometries++),p}function l(g){const p=g.attributes;for(const v in p)n.update(p[v],e.ARRAY_BUFFER)}function d(g){const p=[],v=g.index,A=g.attributes.position;let U=0;if(A===void 0)return;if(v!==null){const P=v.array;U=v.version;for(let F=0,E=P.length;F<E;F+=3){const M=P[F+0],x=P[F+1],L=P[F+2];p.push(M,x,x,L,L,M)}}else{const P=A.array;U=A.version;for(let F=0,E=P.length/3-1;F<E;F+=3){const M=F+0,x=F+1,L=F+2;p.push(M,x,x,L,L,M)}}const h=new(A.count>=65535?qo:Zo)(p,1);h.version=U;const f=r.get(g);f&&n.remove(f),r.set(g,h)}function _(g){const p=r.get(g);if(p){const v=g.index;v!==null&&p.version<v.version&&d(g)}else d(g);return r.get(g)}return{get:c,update:l,getWireframeAttribute:_}}function Lf(e,n,t){let i;function a(g){i=g}let r,o;function c(g){r=g.type,o=g.bytesPerElement}function l(g,p){e.drawElements(i,p,r,g*o),t.update(p,i,1)}function d(g,p,v){v!==0&&(e.drawElementsInstanced(i,p,r,g*o,v),t.update(p,i,v))}function _(g,p,v){if(v===0)return;n.get("WEBGL_multi_draw").multiDrawElementsWEBGL(i,p,0,r,g,0,v);let U=0;for(let h=0;h<v;h++)U+=p[h];t.update(U,i,1)}this.setMode=a,this.setIndex=c,this.render=l,this.renderInstances=d,this.renderMultiDraw=_}function Pf(e){const n={geometries:0,textures:0},t={frame:0,calls:0,triangles:0,points:0,lines:0};function i(r,o,c){switch(t.calls++,o){case e.TRIANGLES:t.triangles+=c*(r/3);break;case e.LINES:t.lines+=c*(r/2);break;case e.LINE_STRIP:t.lines+=c*(r-1);break;case e.LINE_LOOP:t.lines+=c*r;break;case e.POINTS:t.points+=c*r;break;default:et("WebGLInfo: Unknown draw mode:",o);break}}function a(){t.calls=0,t.triangles=0,t.points=0,t.lines=0}return{memory:n,render:t,programs:null,autoReset:!0,reset:a,update:i}}function wf(e,n,t){const i=new WeakMap,a=new Et;function r(o,c,l){const d=o.morphTargetInfluences,_=c.morphAttributes.position||c.morphAttributes.normal||c.morphAttributes.color,g=_!==void 0?_.length:0;let p=i.get(c);if(p===void 0||p.count!==g){let T=function(){L.dispose(),i.delete(c),c.removeEventListener("dispose",T)};p!==void 0&&p.texture.dispose();const v=c.morphAttributes.position!==void 0,A=c.morphAttributes.normal!==void 0,U=c.morphAttributes.color!==void 0,h=c.morphAttributes.position||[],f=c.morphAttributes.normal||[],P=c.morphAttributes.color||[];let F=0;v===!0&&(F=1),A===!0&&(F=2),U===!0&&(F=3);let E=c.attributes.position.count*F,M=1;E>n.maxTextureSize&&(M=Math.ceil(E/n.maxTextureSize),E=n.maxTextureSize);const x=new Float32Array(E*M*4*g),L=new fa(x,E,M,g);L.type=qt,L.needsUpdate=!0;const m=F*4;for(let y=0;y<g;y++){const G=h[y],k=f[y],q=P[y],N=E*M*4*y;for(let K=0;K<G.count;K++){const j=K*m;v===!0&&(a.fromBufferAttribute(G,K),x[N+j+0]=a.x,x[N+j+1]=a.y,x[N+j+2]=a.z,x[N+j+3]=0),A===!0&&(a.fromBufferAttribute(k,K),x[N+j+4]=a.x,x[N+j+5]=a.y,x[N+j+6]=a.z,x[N+j+7]=0),U===!0&&(a.fromBufferAttribute(q,K),x[N+j+8]=a.x,x[N+j+9]=a.y,x[N+j+10]=a.z,x[N+j+11]=q.itemSize===4?a.w:1)}}p={count:g,texture:L,size:new _t(E,M)},i.set(c,p),c.addEventListener("dispose",T)}if(o.isInstancedMesh===!0&&o.morphTexture!==null)l.getUniforms().setValue(e,"morphTexture",o.morphTexture,t);else{let v=0;for(let U=0;U<d.length;U++)v+=d[U];const A=c.morphTargetsRelative?1:1-v;l.getUniforms().setValue(e,"morphTargetBaseInfluence",A),l.getUniforms().setValue(e,"morphTargetInfluences",d)}l.getUniforms().setValue(e,"morphTargetsTexture",p.texture,t),l.getUniforms().setValue(e,"morphTargetsTextureSize",p.size)}return{update:r}}function Uf(e,n,t,i,a){let r=new WeakMap;function o(d){const _=a.render.frame,g=d.geometry,p=n.get(d,g);if(r.get(p)!==_&&(n.update(p),r.set(p,_)),d.isInstancedMesh&&(d.hasEventListener("dispose",l)===!1&&d.addEventListener("dispose",l),r.get(d)!==_&&(t.update(d.instanceMatrix,e.ARRAY_BUFFER),d.instanceColor!==null&&t.update(d.instanceColor,e.ARRAY_BUFFER),r.set(d,_))),d.isSkinnedMesh){const v=d.skeleton;r.get(v)!==_&&(v.update(),r.set(v,_))}return p}function c(){r=new WeakMap}function l(d){const _=d.target;_.removeEventListener("dispose",l),i.releaseStatesOfObject(_),t.remove(_.instanceMatrix),_.instanceColor!==null&&t.remove(_.instanceColor)}return{update:o,dispose:c}}const Df={[va]:"LINEAR_TONE_MAPPING",[ga]:"REINHARD_TONE_MAPPING",[_a]:"CINEON_TONE_MAPPING",[ma]:"ACES_FILMIC_TONE_MAPPING",[ha]:"AGX_TONE_MAPPING",[pa]:"NEUTRAL_TONE_MAPPING",[da]:"CUSTOM_TONE_MAPPING"};function If(e,n,t,i,a,r){const o=new Rt(n,t,{type:e,depthBuffer:a,stencilBuffer:r,samples:i?4:0,storeMultisampledDepthBuffer:!1,storeMultisampledStencilBuffer:!1,resolveDepthBuffer:!1,resolveStencilBuffer:!1});let c=null,l=null;const d=new en;d.setAttribute("position",new Ni([-1,3,0,-1,-1,0,3,-1,0],3)),d.setAttribute("uv",new Ni([0,2,0,0,2,0],2));const _=new xo({uniforms:{tDiffuse:{value:null}},vertexShader:`
			precision highp float;

			uniform mat4 modelViewMatrix;
			uniform mat4 projectionMatrix;

			attribute vec3 position;
			attribute vec2 uv;

			varying vec2 vUv;

			void main() {
				vUv = uv;
				gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
			}`,fragmentShader:`
			precision highp float;

			uniform sampler2D tDiffuse;

			varying vec2 vUv;

			#include <tonemapping_pars_fragment>
			#include <colorspace_pars_fragment>

			void main() {
				gl_FragColor = texture2D( tDiffuse, vUv );

				#ifdef LINEAR_TONE_MAPPING
					gl_FragColor.rgb = LinearToneMapping( gl_FragColor.rgb );
				#elif defined( REINHARD_TONE_MAPPING )
					gl_FragColor.rgb = ReinhardToneMapping( gl_FragColor.rgb );
				#elif defined( CINEON_TONE_MAPPING )
					gl_FragColor.rgb = CineonToneMapping( gl_FragColor.rgb );
				#elif defined( ACES_FILMIC_TONE_MAPPING )
					gl_FragColor.rgb = ACESFilmicToneMapping( gl_FragColor.rgb );
				#elif defined( AGX_TONE_MAPPING )
					gl_FragColor.rgb = AgXToneMapping( gl_FragColor.rgb );
				#elif defined( NEUTRAL_TONE_MAPPING )
					gl_FragColor.rgb = NeutralToneMapping( gl_FragColor.rgb );
				#elif defined( CUSTOM_TONE_MAPPING )
					gl_FragColor.rgb = CustomToneMapping( gl_FragColor.rgb );
				#endif

				#ifdef SRGB_TRANSFER
					gl_FragColor = sRGBTransferOETF( gl_FragColor );
				#endif
			}`,depthTest:!1,depthWrite:!1}),g=new Ot(d,_),p=new Si(-1,1,1,-1,0,1);let v=null,A=null,U=!1,h,f=null,P=[],F=!1;this.setSize=function(E,M){o.setSize(E,M),c!==null&&c.setSize(E,M),l!==null&&l.setSize(E,M);for(let x=0;x<P.length;x++){const L=P[x];L.setSize&&L.setSize(E,M)}},this.setEffects=function(E){P=E,F=P.length>0&&P[0].isRenderPass===!0;const M=o.width,x=o.height;P.length>0&&c===null&&(c=new Rt(M,x,{type:Vt,depthBuffer:!1,stencilBuffer:!1}),l=new Rt(M,x,{type:Vt,depthBuffer:!1,stencilBuffer:!1}));for(let L=0;L<P.length;L++){const m=P[L];m.setSize&&m.setSize(M,x)}},this.begin=function(E,M){if(U||E.toneMapping===Nt&&P.length===0)return!1;if(f=M,M!==null){const x=M.width,L=M.height;(o.width!==x||o.height!==L)&&this.setSize(x,L)}return F===!1&&E.setRenderTarget(o),h=E.toneMapping,E.toneMapping=Nt,!0},this.hasRenderPass=function(){return F},this.end=function(E,M){E.toneMapping=h,U=!0;let x=o,L=c;for(let m=0;m<P.length;m++){const T=P[m];T.enabled!==!1&&(T.render(E,L,x,M),T.needsSwap!==!1&&(x=L,L=L===c?l:c))}if(v!==E.outputColorSpace||A!==E.toneMapping){v=E.outputColorSpace,A=E.toneMapping,_.defines={},tt.getTransfer(v)===Qe&&(_.defines.SRGB_TRANSFER="");const m=Df[A];m&&(_.defines[m]=""),_.needsUpdate=!0}_.uniforms.tDiffuse.value=x.texture,E.setRenderTarget(f),E.render(g,p),f=null,U=!1},this.isCompositing=function(){return U},this.dispose=function(){o.dispose(),c!==null&&c.dispose(),l!==null&&l.dispose(),d.dispose(),_.dispose()}}const La=new ui,pi=new Fn(1,1),Pa=new fa,wa=new es,Ua=new sa,Cr=[],Lr=[],Pr=new Float32Array(16),wr=new Float32Array(9),Ur=new Float32Array(4);function mn(e,n,t){const i=e[0];if(i<=0||i>0)return e;const a=n*t;let r=Cr[a];if(r===void 0&&(r=new Float32Array(a),Cr[a]=r),n!==0){i.toArray(r,0);for(let o=1,c=0;o!==n;++o)c+=t,e[o].toArray(r,c)}return r}function ft(e,n){if(e.length!==n.length)return!1;for(let t=0,i=e.length;t<i;t++)if(e[t]!==n[t])return!1;return!0}function ut(e,n){for(let t=0,i=n.length;t<i;t++)e[t]=n[t]}function Vn(e,n){let t=Lr[n];t===void 0&&(t=new Int32Array(n),Lr[n]=t);for(let i=0;i!==n;++i)t[i]=e.allocateTextureUnit();return t}function Nf(e,n){const t=this.cache;t[0]!==n&&(e.uniform1f(this.addr,n),t[0]=n)}function yf(e,n){const t=this.cache;if(n.x!==void 0)(t[0]!==n.x||t[1]!==n.y)&&(e.uniform2f(this.addr,n.x,n.y),t[0]=n.x,t[1]=n.y);else{if(ft(t,n))return;e.uniform2fv(this.addr,n),ut(t,n)}}function Of(e,n){const t=this.cache;if(n.x!==void 0)(t[0]!==n.x||t[1]!==n.y||t[2]!==n.z)&&(e.uniform3f(this.addr,n.x,n.y,n.z),t[0]=n.x,t[1]=n.y,t[2]=n.z);else if(n.r!==void 0)(t[0]!==n.r||t[1]!==n.g||t[2]!==n.b)&&(e.uniform3f(this.addr,n.r,n.g,n.b),t[0]=n.r,t[1]=n.g,t[2]=n.b);else{if(ft(t,n))return;e.uniform3fv(this.addr,n),ut(t,n)}}function Ff(e,n){const t=this.cache;if(n.x!==void 0)(t[0]!==n.x||t[1]!==n.y||t[2]!==n.z||t[3]!==n.w)&&(e.uniform4f(this.addr,n.x,n.y,n.z,n.w),t[0]=n.x,t[1]=n.y,t[2]=n.z,t[3]=n.w);else{if(ft(t,n))return;e.uniform4fv(this.addr,n),ut(t,n)}}function Bf(e,n){const t=this.cache,i=n.elements;if(i===void 0){if(ft(t,n))return;e.uniformMatrix2fv(this.addr,!1,n),ut(t,n)}else{if(ft(t,i))return;Ur.set(i),e.uniformMatrix2fv(this.addr,!1,Ur),ut(t,i)}}function Gf(e,n){const t=this.cache,i=n.elements;if(i===void 0){if(ft(t,n))return;e.uniformMatrix3fv(this.addr,!1,n),ut(t,n)}else{if(ft(t,i))return;wr.set(i),e.uniformMatrix3fv(this.addr,!1,wr),ut(t,i)}}function Hf(e,n){const t=this.cache,i=n.elements;if(i===void 0){if(ft(t,n))return;e.uniformMatrix4fv(this.addr,!1,n),ut(t,n)}else{if(ft(t,i))return;Pr.set(i),e.uniformMatrix4fv(this.addr,!1,Pr),ut(t,i)}}function Vf(e,n){const t=this.cache;t[0]!==n&&(e.uniform1i(this.addr,n),t[0]=n)}function kf(e,n){const t=this.cache;if(n.x!==void 0)(t[0]!==n.x||t[1]!==n.y)&&(e.uniform2i(this.addr,n.x,n.y),t[0]=n.x,t[1]=n.y);else{if(ft(t,n))return;e.uniform2iv(this.addr,n),ut(t,n)}}function Wf(e,n){const t=this.cache;if(n.x!==void 0)(t[0]!==n.x||t[1]!==n.y||t[2]!==n.z)&&(e.uniform3i(this.addr,n.x,n.y,n.z),t[0]=n.x,t[1]=n.y,t[2]=n.z);else{if(ft(t,n))return;e.uniform3iv(this.addr,n),ut(t,n)}}function zf(e,n){const t=this.cache;if(n.x!==void 0)(t[0]!==n.x||t[1]!==n.y||t[2]!==n.z||t[3]!==n.w)&&(e.uniform4i(this.addr,n.x,n.y,n.z,n.w),t[0]=n.x,t[1]=n.y,t[2]=n.z,t[3]=n.w);else{if(ft(t,n))return;e.uniform4iv(this.addr,n),ut(t,n)}}function Xf(e,n){const t=this.cache;t[0]!==n&&(e.uniform1ui(this.addr,n),t[0]=n)}function Kf(e,n){const t=this.cache;if(n.x!==void 0)(t[0]!==n.x||t[1]!==n.y)&&(e.uniform2ui(this.addr,n.x,n.y),t[0]=n.x,t[1]=n.y);else{if(ft(t,n))return;e.uniform2uiv(this.addr,n),ut(t,n)}}function Yf(e,n){const t=this.cache;if(n.x!==void 0)(t[0]!==n.x||t[1]!==n.y||t[2]!==n.z)&&(e.uniform3ui(this.addr,n.x,n.y,n.z),t[0]=n.x,t[1]=n.y,t[2]=n.z);else{if(ft(t,n))return;e.uniform3uiv(this.addr,n),ut(t,n)}}function qf(e,n){const t=this.cache;if(n.x!==void 0)(t[0]!==n.x||t[1]!==n.y||t[2]!==n.z||t[3]!==n.w)&&(e.uniform4ui(this.addr,n.x,n.y,n.z,n.w),t[0]=n.x,t[1]=n.y,t[2]=n.z,t[3]=n.w);else{if(ft(t,n))return;e.uniform4uiv(this.addr,n),ut(t,n)}}function Zf(e,n,t){const i=this.cache,a=t.allocateTextureUnit();i[0]!==a&&(e.uniform1i(this.addr,a),i[0]=a);let r;this.type===e.SAMPLER_2D_SHADOW?(pi.compareFunction=t.isReversedDepthBuffer()?gi:vi,r=pi):r=La,t.setTexture2D(n||r,a)}function $f(e,n,t){const i=this.cache,a=t.allocateTextureUnit();i[0]!==a&&(e.uniform1i(this.addr,a),i[0]=a),t.setTexture3D(n||wa,a)}function jf(e,n,t){const i=this.cache,a=t.allocateTextureUnit();i[0]!==a&&(e.uniform1i(this.addr,a),i[0]=a),t.setTextureCube(n||Ua,a)}function Qf(e,n,t){const i=this.cache,a=t.allocateTextureUnit();i[0]!==a&&(e.uniform1i(this.addr,a),i[0]=a),t.setTexture2DArray(n||Pa,a)}function Jf(e){switch(e){case 5126:return Nf;case 35664:return yf;case 35665:return Of;case 35666:return Ff;case 35674:return Bf;case 35675:return Gf;case 35676:return Hf;case 5124:case 35670:return Vf;case 35667:case 35671:return kf;case 35668:case 35672:return Wf;case 35669:case 35673:return zf;case 5125:return Xf;case 36294:return Kf;case 36295:return Yf;case 36296:return qf;case 35678:case 36198:case 36298:case 36306:case 35682:return Zf;case 35679:case 36299:case 36307:return $f;case 35680:case 36300:case 36308:case 36293:return jf;case 36289:case 36303:case 36311:case 36292:return Qf}}function eu(e,n){e.uniform1fv(this.addr,n)}function tu(e,n){const t=mn(n,this.size,2);e.uniform2fv(this.addr,t)}function nu(e,n){const t=mn(n,this.size,3);e.uniform3fv(this.addr,t)}function iu(e,n){const t=mn(n,this.size,4);e.uniform4fv(this.addr,t)}function ru(e,n){const t=mn(n,this.size,4);e.uniformMatrix2fv(this.addr,!1,t)}function au(e,n){const t=mn(n,this.size,9);e.uniformMatrix3fv(this.addr,!1,t)}function ou(e,n){const t=mn(n,this.size,16);e.uniformMatrix4fv(this.addr,!1,t)}function su(e,n){e.uniform1iv(this.addr,n)}function cu(e,n){e.uniform2iv(this.addr,n)}function lu(e,n){e.uniform3iv(this.addr,n)}function fu(e,n){e.uniform4iv(this.addr,n)}function uu(e,n){e.uniform1uiv(this.addr,n)}function du(e,n){e.uniform2uiv(this.addr,n)}function pu(e,n){e.uniform3uiv(this.addr,n)}function hu(e,n){e.uniform4uiv(this.addr,n)}function mu(e,n,t){const i=this.cache,a=n.length,r=Vn(t,a);ft(i,r)||(e.uniform1iv(this.addr,r),ut(i,r));let o;this.type===e.SAMPLER_2D_SHADOW?o=pi:o=La;for(let c=0;c!==a;++c)t.setTexture2D(n[c]||o,r[c])}function _u(e,n,t){const i=this.cache,a=n.length,r=Vn(t,a);ft(i,r)||(e.uniform1iv(this.addr,r),ut(i,r));for(let o=0;o!==a;++o)t.setTexture3D(n[o]||wa,r[o])}function gu(e,n,t){const i=this.cache,a=n.length,r=Vn(t,a);ft(i,r)||(e.uniform1iv(this.addr,r),ut(i,r));for(let o=0;o!==a;++o)t.setTextureCube(n[o]||Ua,r[o])}function vu(e,n,t){const i=this.cache,a=n.length,r=Vn(t,a);ft(i,r)||(e.uniform1iv(this.addr,r),ut(i,r));for(let o=0;o!==a;++o)t.setTexture2DArray(n[o]||Pa,r[o])}function Su(e){switch(e){case 5126:return eu;case 35664:return tu;case 35665:return nu;case 35666:return iu;case 35674:return ru;case 35675:return au;case 35676:return ou;case 5124:case 35670:return su;case 35667:case 35671:return cu;case 35668:case 35672:return lu;case 35669:case 35673:return fu;case 5125:return uu;case 36294:return du;case 36295:return pu;case 36296:return hu;case 35678:case 36198:case 36298:case 36306:case 35682:return mu;case 35679:case 36299:case 36307:return _u;case 35680:case 36300:case 36308:case 36293:return gu;case 36289:case 36303:case 36311:case 36292:return vu}}class Eu{constructor(n,t,i){this.id=n,this.addr=i,this.cache=[],this.type=t.type,this.setValue=Jf(t.type)}}class xu{constructor(n,t,i){this.id=n,this.addr=i,this.cache=[],this.type=t.type,this.size=t.size,this.setValue=Su(t.type)}}class Mu{constructor(n){this.id=n,this.seq=[],this.map={}}setValue(n,t,i){const a=this.seq;for(let r=0,o=a.length;r!==o;++r){const c=a[r];c.setValue(n,t[c.id],i)}}}const ii=/(\w+)(\])?(\[|\.)?/g;function Dr(e,n){e.seq.push(n),e.map[n.id]=n}function Tu(e,n,t){const i=e.name,a=i.length;for(ii.lastIndex=0;;){const r=ii.exec(i),o=ii.lastIndex;let c=r[1];const l=r[2]==="]",d=r[3];if(l&&(c=c|0),d===void 0||d==="["&&o+2===a){Dr(t,d===void 0?new Eu(c,e,n):new xu(c,e,n));break}else{let g=t.map[c];g===void 0&&(g=new Mu(c),Dr(t,g)),t=g}}}class Nn{constructor(n,t){this.seq=[],this.map={};const i=n.getProgramParameter(t,n.ACTIVE_UNIFORMS);for(let o=0;o<i;++o){const c=n.getActiveUniform(t,o),l=n.getUniformLocation(t,c.name);Tu(c,l,this)}const a=[],r=[];for(const o of this.seq)o.type===n.SAMPLER_2D_SHADOW||o.type===n.SAMPLER_CUBE_SHADOW||o.type===n.SAMPLER_2D_ARRAY_SHADOW?a.push(o):r.push(o);a.length>0&&(this.seq=a.concat(r))}setValue(n,t,i,a){const r=this.map[t];r!==void 0&&r.setValue(n,i,a)}setOptional(n,t,i){const a=t[i];a!==void 0&&this.setValue(n,i,a)}static upload(n,t,i,a){for(let r=0,o=t.length;r!==o;++r){const c=t[r],l=i[c.id];l.needsUpdate!==!1&&c.setValue(n,l.value,a)}}static seqWithValue(n,t){const i=[];for(let a=0,r=n.length;a!==r;++a){const o=n[a];o.id in t&&i.push(o)}return i}}function Ir(e,n,t){const i=e.createShader(n);return e.shaderSource(i,t),e.compileShader(i),i}const Au=37297;let Ru=0;function bu(e,n){const t=e.split(`
`),i=[],a=Math.max(n-6,0),r=Math.min(n+6,t.length);for(let o=a;o<r;o++){const c=o+1;i.push(`${c===n?">":" "} ${c}: ${t[o]}`)}return i.join(`
`)}const Nr=new Fe;function Cu(e){tt._getMatrix(Nr,tt.workingColorSpace,e);const n=`mat3( ${Nr.elements.map(t=>t.toFixed(4))} )`;switch(tt.getTransfer(e)){case ua:return[n,"LinearTransferOETF"];case Qe:return[n,"sRGBTransferOETF"];default:return ze("WebGLProgram: Unsupported color space: ",e),[n,"LinearTransferOETF"]}}function yr(e,n,t){const i=e.getShaderParameter(n,e.COMPILE_STATUS),r=(e.getShaderInfoLog(n)||"").trim();if(i&&r==="")return"";const o=/ERROR: 0:(\d+)/.exec(r);if(o){const c=parseInt(o[1]);return t.toUpperCase()+`

`+r+`

`+bu(e.getShaderSource(n),c)}else return r}function Lu(e,n){const t=Cu(n);return[`vec4 ${e}( vec4 value ) {`,`	return ${t[1]}( vec4( value.rgb * ${t[0]}, value.a ) );`,"}"].join(`
`)}const Pu={[va]:"Linear",[ga]:"Reinhard",[_a]:"Cineon",[ma]:"ACESFilmic",[ha]:"AgX",[pa]:"Neutral",[da]:"Custom"};function wu(e,n){const t=Pu[n];return t===void 0?(ze("WebGLProgram: Unsupported toneMapping:",n),"vec3 "+e+"( vec3 color ) { return LinearToneMapping( color ); }"):"vec3 "+e+"( vec3 color ) { return "+t+"ToneMapping( color ); }"}const wn=new Le;function Uu(){tt.getLuminanceCoefficients(wn);const e=wn.x.toFixed(4),n=wn.y.toFixed(4),t=wn.z.toFixed(4);return["float luminance( const in vec3 rgb ) {",`	const vec3 weights = vec3( ${e}, ${n}, ${t} );`,"	return dot( weights, rgb );","}"].join(`
`)}function Du(e){return[e.extensionClipCullDistance?"#extension GL_ANGLE_clip_cull_distance : require":"",e.extensionMultiDraw?"#extension GL_ANGLE_multi_draw : require":""].filter(Mn).join(`
`)}function Iu(e){const n=[];for(const t in e){const i=e[t];i!==!1&&n.push("#define "+t+" "+i)}return n.join(`
`)}function Nu(e,n){const t={},i=e.getProgramParameter(n,e.ACTIVE_ATTRIBUTES);for(let a=0;a<i;a++){const r=e.getActiveAttrib(n,a),o=r.name;let c=1;r.type===e.FLOAT_MAT2&&(c=2),r.type===e.FLOAT_MAT3&&(c=3),r.type===e.FLOAT_MAT4&&(c=4),t[o]={type:r.type,location:e.getAttribLocation(n,o),locationSize:c}}return t}function Mn(e){return e!==""}function Or(e,n){const t=n.numSpotLightShadows+n.numSpotLightMaps-n.numSpotLightShadowsWithMaps;return e.replace(/NUM_SUN_LIGHTS/g,n.numSunLights).replace(/NUM_DIR_LIGHTS/g,n.numDirLights).replace(/NUM_SPOT_LIGHTS/g,n.numSpotLights).replace(/NUM_SPOT_LIGHT_MAPS/g,n.numSpotLightMaps).replace(/NUM_SPOT_LIGHT_COORDS/g,t).replace(/NUM_RECT_AREA_LIGHTS/g,n.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,n.numPointLights).replace(/NUM_HEMI_LIGHTS/g,n.numHemiLights).replace(/NUM_SUN_LIGHT_SHADOWS/g,n.numSunLightShadows).replace(/NUM_DIR_LIGHT_SHADOWS/g,n.numDirLightShadows).replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g,n.numSpotLightShadowsWithMaps).replace(/NUM_SPOT_LIGHT_SHADOWS/g,n.numSpotLightShadows).replace(/NUM_POINT_LIGHT_SHADOWS/g,n.numPointLightShadows)}function Fr(e,n){return e.replace(/NUM_CLIPPING_PLANES/g,n.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,n.numClippingPlanes-n.numClipIntersection)}const yu=/^[ \t]*#include +<([\w\d./]+)>/gm;function hi(e){return e.replace(yu,Fu)}const Ou=new Map;function Fu(e,n){let t=we[n];if(t===void 0){const i=Ou.get(n);if(i!==void 0)t=we[i],ze('WebGLRenderer: Shader chunk "%s" has been deprecated. Use "%s" instead.',n,i);else throw new Error("THREE.WebGLProgram: Can not resolve #include <"+n+">")}return hi(t)}const Bu=/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;function Br(e){return e.replace(Bu,Gu)}function Gu(e,n,t,i){let a="";for(let r=parseInt(n);r<parseInt(t);r++)a+=i.replace(/\[\s*i\s*\]/g,"[ "+r+" ]").replace(/UNROLLED_LOOP_INDEX/g,r);return a}function Gr(e){let n=`precision ${e.precision} float;
	precision ${e.precision} int;
	precision ${e.precision} sampler2D;
	precision ${e.precision} samplerCube;
	precision ${e.precision} sampler3D;
	precision ${e.precision} sampler2DArray;
	precision ${e.precision} sampler2DShadow;
	precision ${e.precision} samplerCubeShadow;
	precision ${e.precision} sampler2DArrayShadow;
	precision ${e.precision} isampler2D;
	precision ${e.precision} isampler3D;
	precision ${e.precision} isamplerCube;
	precision ${e.precision} isampler2DArray;
	precision ${e.precision} usampler2D;
	precision ${e.precision} usampler3D;
	precision ${e.precision} usamplerCube;
	precision ${e.precision} usampler2DArray;
	`;return e.precision==="highp"?n+=`
#define HIGH_PRECISION`:e.precision==="mediump"?n+=`
#define MEDIUM_PRECISION`:e.precision==="lowp"&&(n+=`
#define LOW_PRECISION`),n}const Hu={[Dn]:"SHADOWMAP_TYPE_PCF",[xn]:"SHADOWMAP_TYPE_VSM"};function Vu(e){return Hu[e.shadowMapType]||"SHADOWMAP_TYPE_BASIC"}const ku={[bn]:"ENVMAP_TYPE_CUBE",[hn]:"ENVMAP_TYPE_CUBE",[Gn]:"ENVMAP_TYPE_CUBE_UV"};function Wu(e){return e.envMap===!1?"ENVMAP_TYPE_CUBE":ku[e.envMapMode]||"ENVMAP_TYPE_CUBE"}const zu={[hn]:"ENVMAP_MODE_REFRACTION"};function Xu(e){return e.envMap===!1?"ENVMAP_MODE_REFLECTION":zu[e.envMapMode]||"ENVMAP_MODE_REFLECTION"}const Ku={[Jo]:"ENVMAP_BLENDING_MULTIPLY",[Qo]:"ENVMAP_BLENDING_MIX",[jo]:"ENVMAP_BLENDING_ADD"};function Yu(e){return e.envMap===!1?"ENVMAP_BLENDING_NONE":Ku[e.combine]||"ENVMAP_BLENDING_NONE"}function qu(e){const n=e.envMapCubeUVHeight;if(n===null)return null;const t=Math.log2(n)-2,i=1/n;return{texelWidth:1/(3*Math.max(Math.pow(2,t),112)),texelHeight:i,maxMip:t}}function Zu(e,n,t,i){const a=e.getContext(),r=t.defines;let o=t.vertexShader,c=t.fragmentShader;const l=Vu(t),d=Wu(t),_=Xu(t),g=Yu(t),p=qu(t),v=Du(t),A=Iu(r),U=a.createProgram();let h,f,P=t.glslVersion?"#version "+t.glslVersion+`
`:"";t.isRawShaderMaterial?(h=["#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,A].filter(Mn).join(`
`),h.length>0&&(h+=`
`),f=["#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,A].filter(Mn).join(`
`),f.length>0&&(f+=`
`)):(h=[Gr(t),"#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,A,t.extensionClipCullDistance?"#define USE_CLIP_DISTANCE":"",t.batching?"#define USE_BATCHING":"",t.batchingColor?"#define USE_BATCHING_COLOR":"",t.instancing?"#define USE_INSTANCING":"",t.instancingColor?"#define USE_INSTANCING_COLOR":"",t.instancingMorph?"#define USE_INSTANCING_MORPH":"",t.useFog&&t.fog?"#define USE_FOG":"",t.useFog&&t.fogExp2?"#define FOG_EXP2":"",t.map?"#define USE_MAP":"",t.envMap?"#define USE_ENVMAP":"",t.envMap?"#define "+_:"",t.lightMap?"#define USE_LIGHTMAP":"",t.aoMap?"#define USE_AOMAP":"",t.bumpMap?"#define USE_BUMPMAP":"",t.normalMap?"#define USE_NORMALMAP":"",t.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",t.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",t.displacementMap?"#define USE_DISPLACEMENTMAP":"",t.emissiveMap?"#define USE_EMISSIVEMAP":"",t.anisotropy?"#define USE_ANISOTROPY":"",t.anisotropyMap?"#define USE_ANISOTROPYMAP":"",t.clearcoatMap?"#define USE_CLEARCOATMAP":"",t.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",t.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",t.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",t.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",t.specularMap?"#define USE_SPECULARMAP":"",t.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",t.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",t.roughnessMap?"#define USE_ROUGHNESSMAP":"",t.metalnessMap?"#define USE_METALNESSMAP":"",t.alphaMap?"#define USE_ALPHAMAP":"",t.alphaHash?"#define USE_ALPHAHASH":"",t.transmission?"#define USE_TRANSMISSION":"",t.transmissionMap?"#define USE_TRANSMISSIONMAP":"",t.thicknessMap?"#define USE_THICKNESSMAP":"",t.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",t.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",t.mapUv?"#define MAP_UV "+t.mapUv:"",t.alphaMapUv?"#define ALPHAMAP_UV "+t.alphaMapUv:"",t.lightMapUv?"#define LIGHTMAP_UV "+t.lightMapUv:"",t.aoMapUv?"#define AOMAP_UV "+t.aoMapUv:"",t.emissiveMapUv?"#define EMISSIVEMAP_UV "+t.emissiveMapUv:"",t.bumpMapUv?"#define BUMPMAP_UV "+t.bumpMapUv:"",t.normalMapUv?"#define NORMALMAP_UV "+t.normalMapUv:"",t.displacementMapUv?"#define DISPLACEMENTMAP_UV "+t.displacementMapUv:"",t.metalnessMapUv?"#define METALNESSMAP_UV "+t.metalnessMapUv:"",t.roughnessMapUv?"#define ROUGHNESSMAP_UV "+t.roughnessMapUv:"",t.anisotropyMapUv?"#define ANISOTROPYMAP_UV "+t.anisotropyMapUv:"",t.clearcoatMapUv?"#define CLEARCOATMAP_UV "+t.clearcoatMapUv:"",t.clearcoatNormalMapUv?"#define CLEARCOAT_NORMALMAP_UV "+t.clearcoatNormalMapUv:"",t.clearcoatRoughnessMapUv?"#define CLEARCOAT_ROUGHNESSMAP_UV "+t.clearcoatRoughnessMapUv:"",t.iridescenceMapUv?"#define IRIDESCENCEMAP_UV "+t.iridescenceMapUv:"",t.iridescenceThicknessMapUv?"#define IRIDESCENCE_THICKNESSMAP_UV "+t.iridescenceThicknessMapUv:"",t.sheenColorMapUv?"#define SHEEN_COLORMAP_UV "+t.sheenColorMapUv:"",t.sheenRoughnessMapUv?"#define SHEEN_ROUGHNESSMAP_UV "+t.sheenRoughnessMapUv:"",t.specularMapUv?"#define SPECULARMAP_UV "+t.specularMapUv:"",t.specularColorMapUv?"#define SPECULAR_COLORMAP_UV "+t.specularColorMapUv:"",t.specularIntensityMapUv?"#define SPECULAR_INTENSITYMAP_UV "+t.specularIntensityMapUv:"",t.transmissionMapUv?"#define TRANSMISSIONMAP_UV "+t.transmissionMapUv:"",t.thicknessMapUv?"#define THICKNESSMAP_UV "+t.thicknessMapUv:"",t.vertexTangents&&t.flatShading===!1?"#define USE_TANGENT":"",t.vertexNormals?"#define HAS_NORMAL":"",t.vertexColors?"#define USE_COLOR":"",t.vertexAlphas?"#define USE_COLOR_ALPHA":"",t.vertexUv1s?"#define USE_UV1":"",t.vertexUv2s?"#define USE_UV2":"",t.vertexUv3s?"#define USE_UV3":"",t.pointsUvs?"#define USE_POINTS_UV":"",t.flatShading?"#define FLAT_SHADED":"",t.skinning?"#define USE_SKINNING":"",t.morphTargets?"#define USE_MORPHTARGETS":"",t.morphNormals&&t.flatShading===!1?"#define USE_MORPHNORMALS":"",t.morphColors?"#define USE_MORPHCOLORS":"",t.morphTargetsCount>0?"#define MORPHTARGETS_TEXTURE_STRIDE "+t.morphTextureStride:"",t.morphTargetsCount>0?"#define MORPHTARGETS_COUNT "+t.morphTargetsCount:"",t.doubleSided?"#define DOUBLE_SIDED":"",t.flipSided?"#define FLIP_SIDED":"",t.shadowMapEnabled?"#define USE_SHADOWMAP":"",t.shadowMapEnabled?"#define "+l:"",t.sizeAttenuation?"#define USE_SIZEATTENUATION":"",t.numLightProbes>0?"#define USE_LIGHT_PROBES":"",t.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",t.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 modelMatrix;","uniform mat4 modelViewMatrix;","uniform mat4 projectionMatrix;","uniform mat4 viewMatrix;","uniform mat3 normalMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;","#ifdef USE_INSTANCING","	attribute mat4 instanceMatrix;","#endif","#ifdef USE_INSTANCING_COLOR","	attribute vec3 instanceColor;","#endif","#ifdef USE_INSTANCING_MORPH","	uniform sampler2D morphTexture;","#endif","attribute vec3 position;","attribute vec3 normal;","attribute vec2 uv;","#ifdef USE_UV1","	attribute vec2 uv1;","#endif","#ifdef USE_UV2","	attribute vec2 uv2;","#endif","#ifdef USE_UV3","	attribute vec2 uv3;","#endif","#ifdef USE_TANGENT","	attribute vec4 tangent;","#endif","#if defined( USE_COLOR_ALPHA )","	attribute vec4 color;","#elif defined( USE_COLOR )","	attribute vec3 color;","#endif","#ifdef USE_SKINNING","	attribute vec4 skinIndex;","	attribute vec4 skinWeight;","#endif",`
`].filter(Mn).join(`
`),f=[Gr(t),"#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,A,t.useFog&&t.fog?"#define USE_FOG":"",t.useFog&&t.fogExp2?"#define FOG_EXP2":"",t.alphaToCoverage?"#define ALPHA_TO_COVERAGE":"",t.map?"#define USE_MAP":"",t.matcap?"#define USE_MATCAP":"",t.envMap?"#define USE_ENVMAP":"",t.envMap?"#define "+d:"",t.envMap?"#define "+_:"",t.envMap?"#define "+g:"",p?"#define CUBEUV_TEXEL_WIDTH "+p.texelWidth:"",p?"#define CUBEUV_TEXEL_HEIGHT "+p.texelHeight:"",p?"#define CUBEUV_MAX_MIP "+p.maxMip+".0":"",t.lightMap?"#define USE_LIGHTMAP":"",t.aoMap?"#define USE_AOMAP":"",t.bumpMap?"#define USE_BUMPMAP":"",t.normalMap?"#define USE_NORMALMAP":"",t.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",t.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",t.packedNormalMap?"#define USE_PACKED_NORMALMAP":"",t.emissiveMap?"#define USE_EMISSIVEMAP":"",t.anisotropy?"#define USE_ANISOTROPY":"",t.anisotropyMap?"#define USE_ANISOTROPYMAP":"",t.clearcoat?"#define USE_CLEARCOAT":"",t.clearcoatMap?"#define USE_CLEARCOATMAP":"",t.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",t.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",t.dispersion?"#define USE_DISPERSION":"",t.retroreflection?"#define USE_RETROREFLECTION":"",t.iridescence?"#define USE_IRIDESCENCE":"",t.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",t.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",t.specularMap?"#define USE_SPECULARMAP":"",t.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",t.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",t.roughnessMap?"#define USE_ROUGHNESSMAP":"",t.metalnessMap?"#define USE_METALNESSMAP":"",t.alphaMap?"#define USE_ALPHAMAP":"",t.alphaTest?"#define USE_ALPHATEST":"",t.alphaHash?"#define USE_ALPHAHASH":"",t.sheen?"#define USE_SHEEN":"",t.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",t.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",t.transmission?"#define USE_TRANSMISSION":"",t.transmissionMap?"#define USE_TRANSMISSIONMAP":"",t.thicknessMap?"#define USE_THICKNESSMAP":"",t.vertexTangents&&t.flatShading===!1?"#define USE_TANGENT":"",t.vertexColors||t.instancingColor?"#define USE_COLOR":"",t.vertexAlphas||t.batchingColor?"#define USE_COLOR_ALPHA":"",t.vertexUv1s?"#define USE_UV1":"",t.vertexUv2s?"#define USE_UV2":"",t.vertexUv3s?"#define USE_UV3":"",t.pointsUvs?"#define USE_POINTS_UV":"",t.gradientMap?"#define USE_GRADIENTMAP":"",t.flatShading?"#define FLAT_SHADED":"",t.doubleSided?"#define DOUBLE_SIDED":"",t.flipSided?"#define FLIP_SIDED":"",t.shadowMapEnabled?"#define USE_SHADOWMAP":"",t.shadowMapEnabled?"#define "+l:"",t.premultipliedAlpha?"#define PREMULTIPLIED_ALPHA":"",t.numLightProbes>0?"#define USE_LIGHT_PROBES":"",t.numLightProbeGrids>0?"#define USE_LIGHT_PROBES_GRID":"",t.decodeVideoTexture?"#define DECODE_VIDEO_TEXTURE":"",t.decodeVideoTextureEmissive?"#define DECODE_VIDEO_TEXTURE_EMISSIVE":"",t.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",t.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 viewMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;",t.toneMapping!==Nt?"#define TONE_MAPPING":"",t.toneMapping!==Nt?we.tonemapping_pars_fragment:"",t.toneMapping!==Nt?wu("toneMapping",t.toneMapping):"",t.dithering?"#define DITHERING":"",t.opaque?"#define OPAQUE":"",we.colorspace_pars_fragment,Lu("linearToOutputTexel",t.outputColorSpace),Uu(),t.useDepthPacking?"#define DEPTH_PACKING "+t.depthPacking:"",`
`].filter(Mn).join(`
`)),o=hi(o),o=Or(o,t),o=Fr(o,t),c=hi(c),c=Or(c,t),c=Fr(c,t),o=Br(o),c=Br(c),t.isRawShaderMaterial!==!0&&(P=`#version 300 es
`,h=[v,"#define attribute in","#define varying out","#define texture2D texture"].join(`
`)+`
`+h,f=["#define varying in",t.glslVersion===gr?"":"layout(location = 0) out highp vec4 pc_fragColor;",t.glslVersion===gr?"":"#define gl_FragColor pc_fragColor","#define gl_FragDepthEXT gl_FragDepth","#define texture2D texture","#define textureCube texture","#define texture2DProj textureProj","#define texture2DLodEXT textureLod","#define texture2DProjLodEXT textureProjLod","#define textureCubeLodEXT textureLod","#define texture2DGradEXT textureGrad","#define texture2DProjGradEXT textureProjGrad","#define textureCubeGradEXT textureGrad"].join(`
`)+`
`+f);const F=P+h+o,E=P+f+c,M=Ir(a,a.VERTEX_SHADER,F),x=Ir(a,a.FRAGMENT_SHADER,E);a.attachShader(U,M),a.attachShader(U,x),t.index0AttributeName!==void 0?a.bindAttribLocation(U,0,t.index0AttributeName):t.hasPositionAttribute===!0&&a.bindAttribLocation(U,0,"position"),a.linkProgram(U);function L(G){if(e.debug.checkShaderErrors){const k=a.getProgramInfoLog(U)||"",q=a.getShaderInfoLog(M)||"",N=a.getShaderInfoLog(x)||"",K=k.trim(),j=q.trim(),Y=N.trim();let ne=!0,Z=!0;if(a.getProgramParameter(U,a.LINK_STATUS)===!1)if(ne=!1,typeof e.debug.onShaderError=="function")e.debug.onShaderError(a,U,M,x);else{const J=yr(a,M,"vertex"),ee=yr(a,x,"fragment");et("WebGLProgram: Shader Error "+a.getError()+" - VALIDATE_STATUS "+a.getProgramParameter(U,a.VALIDATE_STATUS)+`

Material Name: `+G.name+`
Material Type: `+G.type+`

Program Info Log: `+K+`
`+J+`
`+ee)}else K!==""?ze("WebGLProgram: Program Info Log:",K):(j===""||Y==="")&&(Z=!1);Z&&(G.diagnostics={runnable:ne,programLog:K,vertexShader:{log:j,prefix:h},fragmentShader:{log:Y,prefix:f}})}a.deleteShader(M),a.deleteShader(x),m=new Nn(a,U),T=Nu(a,U)}let m;this.getUniforms=function(){return m===void 0&&L(this),m};let T;this.getAttributes=function(){return T===void 0&&L(this),T};let y=t.rendererExtensionParallelShaderCompile===!1;return this.isReady=function(){return y===!1&&(y=a.getProgramParameter(U,Au)),y},this.destroy=function(){i.releaseStatesOfProgram(this),a.deleteProgram(U),this.program=void 0},this.type=t.shaderType,this.name=t.shaderName,this.id=Ru++,this.cacheKey=n,this.usedTimes=1,this.program=U,this.vertexShader=M,this.fragmentShader=x,this}let $u=0;class ju{constructor(){this.shaderCache=new Map,this.materialCache=new Map}update(n,t,i){const a=this._getShaderCacheForMaterial(n);return a.has(t)===!1&&(a.add(t),t.usedTimes++),a.has(i)===!1&&(a.add(i),i.usedTimes++),this}remove(n){const t=this.materialCache.get(n);for(const i of t)i.usedTimes--,i.usedTimes===0&&this.shaderCache.delete(i.code);return this.materialCache.delete(n),this}getVertexShaderStage(n){return this._getShaderStage(n.vertexShader)}getFragmentShaderStage(n){return this._getShaderStage(n.fragmentShader)}dispose(){this.shaderCache.clear(),this.materialCache.clear()}_getShaderCacheForMaterial(n){const t=this.materialCache;let i=t.get(n);return i===void 0&&(i=new Set,t.set(n,i)),i}_getShaderStage(n){const t=this.shaderCache;let i=t.get(n);return i===void 0&&(i=new Qu(n),t.set(n,i)),i}}class Qu{constructor(n){this.id=$u++,this.code=n,this.usedTimes=0}}function Ju(e){return e===dn||e===li||e===fi}function ed(e,n,t,i,a,r){const o=new Yo,c=new ju,l=new Set,d=[],_=new Map,g=i.logarithmicDepthBuffer;let p=i.precision;const v={MeshDepthMaterial:"depth",MeshDistanceMaterial:"distance",MeshNormalMaterial:"normal",MeshBasicMaterial:"basic",MeshLambertMaterial:"lambert",MeshPhongMaterial:"phong",MeshToonMaterial:"toon",MeshStandardMaterial:"physical",MeshPhysicalMaterial:"physical",MeshMatcapMaterial:"matcap",LineBasicMaterial:"basic",LineDashedMaterial:"dashed",PointsMaterial:"points",ShadowMaterial:"shadow",SpriteMaterial:"sprite"};function A(m){return l.add(m),m===0?"uv":`uv${m}`}function U(m,T,y,G,k,q){const N=G.fog,K=k.geometry,j=m.isMeshStandardMaterial||m.isMeshLambertMaterial||m.isMeshPhongMaterial?G.environment:null,Y=m.isMeshStandardMaterial||m.isMeshLambertMaterial&&!m.envMap||m.isMeshPhongMaterial&&!m.envMap,ne=n.get(m.envMap||j,Y),Z=ne&&ne.mapping===Gn?ne.image.height:null,J=v[m.type];m.precision!==null&&(p=i.getMaxPrecision(m.precision),p!==m.precision&&ze("WebGLProgram.getParameters:",m.precision,"not supported, using",p,"instead."));const ee=K.morphAttributes.position||K.morphAttributes.normal||K.morphAttributes.color,be=ee!==void 0?ee.length:0;let Re=0;K.morphAttributes.position!==void 0&&(Re=1),K.morphAttributes.normal!==void 0&&(Re=2),K.morphAttributes.color!==void 0&&(Re=3);let rt,Xe,Ke,W;if(J){const $e=Ut[J];rt=$e.vertexShader,Xe=$e.fragmentShader}else{rt=m.vertexShader,Xe=m.fragmentShader;const $e=c.getVertexShaderStage(m),Ve=c.getFragmentShaderStage(m);c.update(m,$e,Ve),Ke=$e.id,W=Ve.id}const $=e.getRenderTarget(),Ee=e.state.buffers.depth.getReversed(),Ue=k.isInstancedMesh===!0,me=k.isBatchedMesh===!0,Oe=!!m.map,lt=!!m.matcap,Ie=!!ne,Ge=!!m.aoMap,Ze=!!m.lightMap,ye=!!m.bumpMap&&m.wireframe===!1,nt=!!m.normalMap,dt=!!m.displacementMap,vt=!!m.emissiveMap,it=!!m.metalnessMap,st=!!m.roughnessMap,C=m.anisotropy>0,pt=m.clearcoat>0,We=m.dispersion>0,S=m.retroreflectivity>0,s=m.iridescence>0,w=m.sheen>0,O=m.transmission>0,H=C&&!!m.anisotropyMap,te=pt&&!!m.clearcoatMap,ie=pt&&!!m.clearcoatNormalMap,V=pt&&!!m.clearcoatRoughnessMap,X=s&&!!m.iridescenceMap,re=s&&!!m.iridescenceThicknessMap,xe=w&&!!m.sheenColorMap,ce=w&&!!m.sheenRoughnessMap,ae=!!m.specularMap,Me=!!m.specularColorMap,Ae=!!m.specularIntensityMap,Ce=O&&!!m.transmissionMap,b=O&&!!m.thicknessMap,oe=!!m.gradientMap,z=!!m.alphaMap,se=m.alphaTest>0,de=!!m.alphaHash,Q=!!m.extensions;let Te=Nt;m.toneMapped&&($===null||$.isXRRenderTarget===!0)&&(Te=e.toneMapping);const ve={shaderID:J,shaderType:m.type,shaderName:m.name,vertexShader:rt,fragmentShader:Xe,defines:m.defines,customVertexShaderID:Ke,customFragmentShaderID:W,isRawShaderMaterial:m.isRawShaderMaterial===!0,glslVersion:m.glslVersion,precision:p,batching:me,batchingColor:me&&k._colorsTexture!==null,instancing:Ue,instancingColor:Ue&&k.instanceColor!==null,instancingMorph:Ue&&k.morphTexture!==null,outputColorSpace:$===null?e.outputColorSpace:$.isXRRenderTarget===!0?$.texture.colorSpace:tt.workingColorSpace,alphaToCoverage:!!m.alphaToCoverage,map:Oe,matcap:lt,envMap:Ie,envMapMode:Ie&&ne.mapping,envMapCubeUVHeight:Z,aoMap:Ge,lightMap:Ze,bumpMap:ye,normalMap:nt,displacementMap:dt,emissiveMap:vt,normalMapObjectSpace:nt&&m.normalMapType===Bo,normalMapTangentSpace:nt&&m.normalMapType===Gi,packedNormalMap:nt&&m.normalMapType===Gi&&Ju(m.normalMap.format),metalnessMap:it,roughnessMap:st,anisotropy:C,anisotropyMap:H,clearcoat:pt,clearcoatMap:te,clearcoatNormalMap:ie,clearcoatRoughnessMap:V,dispersion:We,retroreflection:S,iridescence:s,iridescenceMap:X,iridescenceThicknessMap:re,sheen:w,sheenColorMap:xe,sheenRoughnessMap:ce,specularMap:ae,specularColorMap:Me,specularIntensityMap:Ae,transmission:O,transmissionMap:Ce,thicknessMap:b,gradientMap:oe,opaque:m.transparent===!1&&m.blending===In&&m.alphaToCoverage===!1,alphaMap:z,alphaTest:se,alphaHash:de,combine:m.combine,mapUv:Oe&&A(m.map.channel),aoMapUv:Ge&&A(m.aoMap.channel),lightMapUv:Ze&&A(m.lightMap.channel),bumpMapUv:ye&&A(m.bumpMap.channel),normalMapUv:nt&&A(m.normalMap.channel),displacementMapUv:dt&&A(m.displacementMap.channel),emissiveMapUv:vt&&A(m.emissiveMap.channel),metalnessMapUv:it&&A(m.metalnessMap.channel),roughnessMapUv:st&&A(m.roughnessMap.channel),anisotropyMapUv:H&&A(m.anisotropyMap.channel),clearcoatMapUv:te&&A(m.clearcoatMap.channel),clearcoatNormalMapUv:ie&&A(m.clearcoatNormalMap.channel),clearcoatRoughnessMapUv:V&&A(m.clearcoatRoughnessMap.channel),iridescenceMapUv:X&&A(m.iridescenceMap.channel),iridescenceThicknessMapUv:re&&A(m.iridescenceThicknessMap.channel),sheenColorMapUv:xe&&A(m.sheenColorMap.channel),sheenRoughnessMapUv:ce&&A(m.sheenRoughnessMap.channel),specularMapUv:ae&&A(m.specularMap.channel),specularColorMapUv:Me&&A(m.specularColorMap.channel),specularIntensityMapUv:Ae&&A(m.specularIntensityMap.channel),transmissionMapUv:Ce&&A(m.transmissionMap.channel),thicknessMapUv:b&&A(m.thicknessMap.channel),alphaMapUv:z&&A(m.alphaMap.channel),vertexTangents:!!K.attributes.tangent&&(nt||C),vertexNormals:!!K.attributes.normal,vertexColors:m.vertexColors,vertexAlphas:m.vertexColors===!0&&!!K.attributes.color&&K.attributes.color.itemSize===4,pointsUvs:k.isPoints===!0&&!!K.attributes.uv&&(Oe||z),fog:!!N,useFog:m.fog===!0,fogExp2:!!N&&N.isFogExp2,flatShading:m.wireframe===!1&&(m.flatShading===!0||K.attributes.normal===void 0&&nt===!1&&(m.isMeshLambertMaterial||m.isMeshPhongMaterial||m.isMeshStandardMaterial||m.isMeshPhysicalMaterial)),sizeAttenuation:m.sizeAttenuation===!0,logarithmicDepthBuffer:g,reversedDepthBuffer:Ee,skinning:k.isSkinnedMesh===!0,hasPositionAttribute:K.attributes.position!==void 0,morphTargets:K.morphAttributes.position!==void 0,morphNormals:K.morphAttributes.normal!==void 0,morphColors:K.morphAttributes.color!==void 0,morphTargetsCount:be,morphTextureStride:Re,numSunLights:T.sun.length,numDirLights:T.directional.length,numPointLights:T.point.length,numSpotLights:T.spot.length,numSpotLightMaps:T.spotLightMap.length,numRectAreaLights:T.rectArea.length,numHemiLights:T.hemi.length,numSunLightShadows:T.sunShadowMap.length,numDirLightShadows:T.directionalShadowMap.length,numPointLightShadows:T.pointShadowMap.length,numSpotLightShadows:T.spotShadowMap.length,numSpotLightShadowsWithMaps:T.numSpotLightShadowsWithMaps,numLightProbes:T.numLightProbes,numLightProbeGrids:q.length,numClippingPlanes:r.numPlanes,numClipIntersection:r.numIntersection,dithering:m.dithering,shadowMapEnabled:e.shadowMap.enabled&&y.length>0,shadowMapType:e.shadowMap.type,toneMapping:Te,decodeVideoTexture:Oe&&m.map.isVideoTexture===!0&&tt.getTransfer(m.map.colorSpace)===Qe,decodeVideoTextureEmissive:vt&&m.emissiveMap.isVideoTexture===!0&&tt.getTransfer(m.emissiveMap.colorSpace)===Qe,premultipliedAlpha:m.premultipliedAlpha,doubleSided:m.side===It,flipSided:m.side===xt,useDepthPacking:m.depthPacking>=0,depthPacking:m.depthPacking||0,index0AttributeName:m.index0AttributeName,extensionClipCullDistance:Q&&m.extensions.clipCullDistance===!0&&t.has("WEBGL_clip_cull_distance"),extensionMultiDraw:(Q&&m.extensions.multiDraw===!0||me)&&t.has("WEBGL_multi_draw"),rendererExtensionParallelShaderCompile:t.has("KHR_parallel_shader_compile"),customProgramCacheKey:m.customProgramCacheKey()};return ve.vertexUv1s=l.has(1),ve.vertexUv2s=l.has(2),ve.vertexUv3s=l.has(3),l.clear(),ve}function h(m){const T=[];if(m.shaderID?T.push(m.shaderID):(T.push(m.customVertexShaderID),T.push(m.customFragmentShaderID)),m.defines!==void 0)for(const y in m.defines)T.push(y),T.push(m.defines[y]);return m.isRawShaderMaterial===!1&&(f(T,m),P(T,m),T.push(e.outputColorSpace)),T.push(m.customProgramCacheKey),T.join()}function f(m,T){m.push(T.precision),m.push(T.outputColorSpace),m.push(T.envMapMode),m.push(T.envMapCubeUVHeight),m.push(T.mapUv),m.push(T.alphaMapUv),m.push(T.lightMapUv),m.push(T.aoMapUv),m.push(T.bumpMapUv),m.push(T.normalMapUv),m.push(T.displacementMapUv),m.push(T.emissiveMapUv),m.push(T.metalnessMapUv),m.push(T.roughnessMapUv),m.push(T.anisotropyMapUv),m.push(T.clearcoatMapUv),m.push(T.clearcoatNormalMapUv),m.push(T.clearcoatRoughnessMapUv),m.push(T.iridescenceMapUv),m.push(T.iridescenceThicknessMapUv),m.push(T.sheenColorMapUv),m.push(T.sheenRoughnessMapUv),m.push(T.specularMapUv),m.push(T.specularColorMapUv),m.push(T.specularIntensityMapUv),m.push(T.transmissionMapUv),m.push(T.thicknessMapUv),m.push(T.combine),m.push(T.fogExp2),m.push(T.sizeAttenuation),m.push(T.morphTargetsCount),m.push(T.morphAttributeCount),m.push(T.numSunLights),m.push(T.numDirLights),m.push(T.numPointLights),m.push(T.numSpotLights),m.push(T.numSpotLightMaps),m.push(T.numHemiLights),m.push(T.numRectAreaLights),m.push(T.numSunLightShadows),m.push(T.numDirLightShadows),m.push(T.numPointLightShadows),m.push(T.numSpotLightShadows),m.push(T.numSpotLightShadowsWithMaps),m.push(T.numLightProbes),m.push(T.shadowMapType),m.push(T.toneMapping),m.push(T.numClippingPlanes),m.push(T.numClipIntersection),m.push(T.depthPacking)}function P(m,T){o.disableAll(),T.instancing&&o.enable(0),T.instancingColor&&o.enable(1),T.instancingMorph&&o.enable(2),T.matcap&&o.enable(3),T.envMap&&o.enable(4),T.normalMapObjectSpace&&o.enable(5),T.normalMapTangentSpace&&o.enable(6),T.clearcoat&&o.enable(7),T.iridescence&&o.enable(8),T.alphaTest&&o.enable(9),T.vertexColors&&o.enable(10),T.vertexAlphas&&o.enable(11),T.vertexUv1s&&o.enable(12),T.vertexUv2s&&o.enable(13),T.vertexUv3s&&o.enable(14),T.vertexTangents&&o.enable(15),T.anisotropy&&o.enable(16),T.alphaHash&&o.enable(17),T.batching&&o.enable(18),T.dispersion&&o.enable(19),T.retroreflection&&o.enable(24),T.batchingColor&&o.enable(20),T.gradientMap&&o.enable(21),T.packedNormalMap&&o.enable(22),T.vertexNormals&&o.enable(23),m.push(o.mask),o.disableAll(),T.fog&&o.enable(0),T.useFog&&o.enable(1),T.flatShading&&o.enable(2),T.logarithmicDepthBuffer&&o.enable(3),T.reversedDepthBuffer&&o.enable(4),T.skinning&&o.enable(5),T.morphTargets&&o.enable(6),T.morphNormals&&o.enable(7),T.morphColors&&o.enable(8),T.premultipliedAlpha&&o.enable(9),T.shadowMapEnabled&&o.enable(10),T.doubleSided&&o.enable(11),T.flipSided&&o.enable(12),T.useDepthPacking&&o.enable(13),T.dithering&&o.enable(14),T.transmission&&o.enable(15),T.sheen&&o.enable(16),T.opaque&&o.enable(17),T.pointsUvs&&o.enable(18),T.decodeVideoTexture&&o.enable(19),T.decodeVideoTextureEmissive&&o.enable(20),T.alphaToCoverage&&o.enable(21),T.numLightProbeGrids>0&&o.enable(22),T.hasPositionAttribute&&o.enable(23),m.push(o.mask)}function F(m){const T=v[m.type];let y;if(T){const G=Ut[T];y=Fo.clone(G.uniforms)}else y=m.uniforms;return y}function E(m,T){let y=_.get(T);return y!==void 0?++y.usedTimes:(y=new Zu(e,T,m,a),d.push(y),_.set(T,y)),y}function M(m){if(--m.usedTimes===0){const T=d.indexOf(m);d[T]=d[d.length-1],d.pop(),_.delete(m.cacheKey),m.destroy()}}function x(m){c.remove(m)}function L(){c.dispose()}return{getParameters:U,getProgramCacheKey:h,getUniforms:F,acquireProgram:E,releaseProgram:M,releaseShaderCache:x,programs:d,dispose:L}}function td(){let e=new WeakMap;function n(o){return e.has(o)}function t(o){let c=e.get(o);return c===void 0&&(c={},e.set(o,c)),c}function i(o){e.delete(o)}function a(o,c,l){e.get(o)[c]=l}function r(){e=new WeakMap}return{has:n,get:t,remove:i,update:a,dispose:r}}function nd(e,n){return e.groupOrder!==n.groupOrder?e.groupOrder-n.groupOrder:e.renderOrder!==n.renderOrder?e.renderOrder-n.renderOrder:e.material.id!==n.material.id?e.material.id-n.material.id:e.materialVariant!==n.materialVariant?e.materialVariant-n.materialVariant:e.z!==n.z?e.z-n.z:e.id-n.id}function Hr(e,n){return e.groupOrder!==n.groupOrder?e.groupOrder-n.groupOrder:e.renderOrder!==n.renderOrder?e.renderOrder-n.renderOrder:e.z!==n.z?n.z-e.z:e.id-n.id}function Vr(){const e=[];let n=0;const t=[],i=[],a=[];function r(){n=0,t.length=0,i.length=0,a.length=0}function o(p){let v=0;return p.isInstancedMesh&&(v+=2),p.isSkinnedMesh&&(v+=1),v}function c(p,v,A,U,h,f){let P=e[n];return P===void 0?(P={id:p.id,object:p,geometry:v,material:A,materialVariant:o(p),groupOrder:U,renderOrder:p.renderOrder,z:h,group:f},e[n]=P):(P.id=p.id,P.object=p,P.geometry=v,P.material=A,P.materialVariant=o(p),P.groupOrder=U,P.renderOrder=p.renderOrder,P.z=h,P.group=f),n++,P}function l(p,v,A,U,h,f,P){P.reversedDepth===!0&&(h=-h);const F=c(p,v,A,U,h,f);A.transmission>0?i.push(F):A.transparent===!0?a.push(F):t.push(F)}function d(p,v,A,U,h,f){const P=c(p,v,A,U,h,f);A.transmission>0?i.unshift(P):A.transparent===!0?a.unshift(P):t.unshift(P)}function _(p,v){t.length>1&&t.sort(p||nd),i.length>1&&i.sort(v||Hr),a.length>1&&a.sort(v||Hr)}function g(){for(let p=n,v=e.length;p<v;p++){const A=e[p];if(A.id===null)break;A.id=null,A.object=null,A.geometry=null,A.material=null,A.group=null}}return{opaque:t,transmissive:i,transparent:a,init:r,push:l,unshift:d,finish:g,sort:_}}function id(){let e=new WeakMap;function n(i,a){const r=e.get(i);let o;return r===void 0?(o=new Vr,e.set(i,[o])):a>=r.length?(o=new Vr,r.push(o)):o=r[a],o}function t(){e=new WeakMap}return{get:n,dispose:t}}function rd(){const e={};return{get:function(n){if(e[n.id]!==void 0)return e[n.id];let t;switch(n.type){case"SunLight":case"DirectionalLight":t={direction:new Le,color:new He};break;case"SpotLight":t={position:new Le,direction:new Le,color:new He,distance:0,coneCos:0,penumbraCos:0,decay:0};break;case"PointLight":t={position:new Le,color:new He,distance:0,decay:0};break;case"HemisphereLight":t={direction:new Le,skyColor:new He,groundColor:new He};break;case"RectAreaLight":t={color:new He,position:new Le,halfWidth:new Le,halfHeight:new Le};break}return e[n.id]=t,t}}}function ad(){const e={};return{get:function(n){if(e[n.id]!==void 0)return e[n.id];let t;switch(n.type){case"SunLight":case"DirectionalLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new _t};break;case"SpotLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new _t};break;case"PointLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new _t,shadowCameraNear:1,shadowCameraFar:1e3};break}return e[n.id]=t,t}}}let od=0;function sd(e,n){return(n.castShadow?2:0)-(e.castShadow?2:0)+(n.map?1:0)-(e.map?1:0)}function cd(e){const n=new rd,t=ad(),i={version:0,hash:{sunLength:-1,directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,numSunShadows:-1,numDirectionalShadows:-1,numPointShadows:-1,numSpotShadows:-1,numSpotMaps:-1,numLightProbes:-1},ambient:[0,0,0],probe:[],sun:[],sunShadow:[],sunShadowMap:[],sunShadowMatrix:[],sunShadowCascade:[],directional:[],directionalShadow:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotLightMap:[],spotShadow:[],spotShadowMap:[],spotLightMatrix:[],rectArea:[],rectAreaLTC1:null,rectAreaLTC2:null,point:[],pointShadow:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};for(let d=0;d<9;d++)i.probe.push(new Le);const a=new Le,r=new yt,o=new yt;function c(d){let _=0,g=0,p=0;for(let k=0;k<9;k++)i.probe[k].set(0,0,0);let v=0,A=0,U=0,h=0,f=0,P=0,F=0,E=0,M=0,x=0,L=0,m=0,T=0,y=0;d.sort(sd);for(let k=0,q=d.length;k<q;k++){const N=d[k],K=N.color,j=N.intensity,Y=N.distance;let ne=null;if(N.shadow&&N.shadow.map&&(N.shadow.map.texture.format===dn?ne=N.shadow.map.texture:ne=N.shadow.map.depthTexture||N.shadow.map.texture),N.isAmbientLight)_+=K.r*j,g+=K.g*j,p+=K.b*j;else if(N.isLightProbe){for(let Z=0;Z<9;Z++)i.probe[Z].addScaledVector(N.sh.coefficients[Z],j);y++}else if(N.isSunLight){const Z=n.get(N);if(Z.color.copy(N.color).multiplyScalar(N.intensity),N.castShadow){const J=N.shadow,ee=t.get(N);ee.shadowIntensity=J.intensity,ee.shadowBias=J.bias,ee.shadowNormalBias=J.normalBias,ee.shadowRadius=J.radius,ee.shadowMapSize.copy(J.mapSize).multiply(J.getFrameExtents()),i.sunShadow[A]=ee,i.sunShadowMap[A]=ne;const be=J.getViewportCount();for(let Re=0;Re<be;Re++)i.sunShadowMatrix[U+Re]=J.getMatrix(Re),i.sunShadowCascade[U+Re]=J._cascadeData[Re];U+=be,A++}i.sun[v]=Z,v++}else if(N.isDirectionalLight){const Z=n.get(N);if(Z.color.copy(N.color).multiplyScalar(N.intensity),N.castShadow){const J=N.shadow,ee=t.get(N);ee.shadowIntensity=J.intensity,ee.shadowBias=J.bias,ee.shadowNormalBias=J.normalBias,ee.shadowRadius=J.radius,ee.shadowMapSize=J.mapSize,i.directionalShadow[h]=ee,i.directionalShadowMap[h]=ne,i.directionalShadowMatrix[h]=N.shadow.matrix,M++}i.directional[h]=Z,h++}else if(N.isSpotLight){const Z=n.get(N);Z.position.setFromMatrixPosition(N.matrixWorld),Z.color.copy(K).multiplyScalar(j),Z.distance=Y,Z.coneCos=Math.cos(N.angle),Z.penumbraCos=Math.cos(N.angle*(1-N.penumbra)),Z.decay=N.decay,i.spot[P]=Z;const J=N.shadow;if(N.map&&(i.spotLightMap[m]=N.map,m++,J.updateMatrices(N),N.castShadow&&T++),i.spotLightMatrix[P]=J.matrix,N.castShadow){const ee=t.get(N);ee.shadowIntensity=J.intensity,ee.shadowBias=J.bias,ee.shadowNormalBias=J.normalBias,ee.shadowRadius=J.radius,ee.shadowMapSize=J.mapSize,i.spotShadow[P]=ee,i.spotShadowMap[P]=ne,L++}P++}else if(N.isRectAreaLight){const Z=n.get(N);Z.color.copy(K).multiplyScalar(j),Z.halfWidth.set(N.width*.5,0,0),Z.halfHeight.set(0,N.height*.5,0),i.rectArea[F]=Z,F++}else if(N.isPointLight){const Z=n.get(N);if(Z.color.copy(N.color).multiplyScalar(N.intensity),Z.distance=N.distance,Z.decay=N.decay,N.castShadow){const J=N.shadow,ee=t.get(N);ee.shadowIntensity=J.intensity,ee.shadowBias=J.bias,ee.shadowNormalBias=J.normalBias,ee.shadowRadius=J.radius,ee.shadowMapSize=J.mapSize,ee.shadowCameraNear=J.camera.near,ee.shadowCameraFar=J.camera.far,i.pointShadow[f]=ee,i.pointShadowMap[f]=ne,i.pointShadowMatrix[f]=N.shadow.matrix,x++}i.point[f]=Z,f++}else if(N.isHemisphereLight){const Z=n.get(N);Z.skyColor.copy(N.color).multiplyScalar(j),Z.groundColor.copy(N.groundColor).multiplyScalar(j),i.hemi[E]=Z,E++}}F>0&&(e.has("OES_texture_float_linear")===!0?(i.rectAreaLTC1=le.LTC_FLOAT_1,i.rectAreaLTC2=le.LTC_FLOAT_2):(i.rectAreaLTC1=le.LTC_HALF_1,i.rectAreaLTC2=le.LTC_HALF_2)),i.ambient[0]=_,i.ambient[1]=g,i.ambient[2]=p;const G=i.hash;(G.sunLength!==v||G.directionalLength!==h||G.pointLength!==f||G.spotLength!==P||G.rectAreaLength!==F||G.hemiLength!==E||G.numSunShadows!==A||G.numDirectionalShadows!==M||G.numPointShadows!==x||G.numSpotShadows!==L||G.numSpotMaps!==m||G.numLightProbes!==y)&&(i.sun.length=v,i.directional.length=h,i.spot.length=P,i.rectArea.length=F,i.point.length=f,i.hemi.length=E,i.sunShadow.length=A,i.sunShadowMap.length=A,i.sunShadowMatrix.length=U,i.sunShadowCascade.length=U,i.directionalShadow.length=M,i.directionalShadowMap.length=M,i.directionalShadowMatrix.length=M,i.pointShadow.length=x,i.pointShadowMap.length=x,i.pointShadowMatrix.length=x,i.spotShadow.length=L,i.spotShadowMap.length=L,i.spotLightMatrix.length=L+m-T,i.spotLightMap.length=m,i.numSpotLightShadowsWithMaps=T,i.numLightProbes=y,G.sunLength=v,G.directionalLength=h,G.pointLength=f,G.spotLength=P,G.rectAreaLength=F,G.hemiLength=E,G.numSunShadows=A,G.numDirectionalShadows=M,G.numPointShadows=x,G.numSpotShadows=L,G.numSpotMaps=m,G.numLightProbes=y,i.version=od++)}function l(d,_){let g=0,p=0,v=0,A=0,U=0,h=0;const f=_.matrixWorldInverse;for(let P=0,F=d.length;P<F;P++){const E=d[P];if(E.isSunLight){const M=i.sun[g];M.direction.setFromMatrixPosition(E.matrixWorld),M.direction.transformDirection(f),g++}else if(E.isDirectionalLight){const M=i.directional[p];M.direction.setFromMatrixPosition(E.matrixWorld),a.setFromMatrixPosition(E.target.matrixWorld),M.direction.sub(a),M.direction.transformDirection(f),p++}else if(E.isSpotLight){const M=i.spot[A];M.position.setFromMatrixPosition(E.matrixWorld),M.position.applyMatrix4(f),M.direction.setFromMatrixPosition(E.matrixWorld),a.setFromMatrixPosition(E.target.matrixWorld),M.direction.sub(a),M.direction.transformDirection(f),A++}else if(E.isRectAreaLight){const M=i.rectArea[U];M.position.setFromMatrixPosition(E.matrixWorld),M.position.applyMatrix4(f),o.identity(),r.copy(E.matrixWorld),r.premultiply(f),o.extractRotation(r),M.halfWidth.set(E.width*.5,0,0),M.halfHeight.set(0,E.height*.5,0),M.halfWidth.applyMatrix4(o),M.halfHeight.applyMatrix4(o),U++}else if(E.isPointLight){const M=i.point[v];M.position.setFromMatrixPosition(E.matrixWorld),M.position.applyMatrix4(f),v++}else if(E.isHemisphereLight){const M=i.hemi[h];M.direction.setFromMatrixPosition(E.matrixWorld),M.direction.transformDirection(f),h++}}}return{setup:c,setupView:l,state:i}}function kr(e){const n=new cd(e),t=[],i=[],a=[];function r(p){g.camera=p,t.length=0,i.length=0,a.length=0}function o(p){t.push(p)}function c(p){i.push(p)}function l(p){a.push(p)}function d(){n.setup(t)}function _(p){n.setupView(t,p)}const g={lightsArray:t,shadowsArray:i,lightProbeGridArray:a,camera:null,lights:n,transmissionRenderTarget:{},textureUnits:0};return{init:r,state:g,setupLights:d,setupLightsView:_,pushLight:o,pushShadow:c,pushLightProbeGrid:l}}function ld(e){let n=new WeakMap;function t(a,r=0){const o=n.get(a);let c;return o===void 0?(c=new kr(e),n.set(a,[c])):r>=o.length?(c=new kr(e),o.push(c)):c=o[r],c}function i(){n=new WeakMap}return{get:t,dispose:i}}const fd=`void main() {
	gl_Position = vec4( position, 1.0 );
}`,ud=`uniform sampler2D shadow_pass;
uniform vec2 resolution;
uniform float radius;
void main() {
	const float samples = float( VSM_SAMPLES );
	float mean = 0.0;
	float squared_mean = 0.0;
	float uvStride = samples <= 1.0 ? 0.0 : 2.0 / ( samples - 1.0 );
	float uvStart = samples <= 1.0 ? 0.0 : - 1.0;
	for ( float i = 0.0; i < samples; i ++ ) {
		float uvOffset = uvStart + i * uvStride;
		#ifdef HORIZONTAL_PASS
			vec2 distribution = texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( uvOffset, 0.0 ) * radius ) / resolution ).rg;
			mean += distribution.x;
			squared_mean += distribution.y * distribution.y + distribution.x * distribution.x;
		#else
			float depth = texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( 0.0, uvOffset ) * radius ) / resolution ).r;
			mean += depth;
			squared_mean += depth * depth;
		#endif
	}
	mean = mean / samples;
	squared_mean = squared_mean / samples;
	float std_dev = sqrt( max( 0.0, squared_mean - mean * mean ) );
	gl_FragColor = vec4( mean, std_dev, 0.0, 1.0 );
}`,dd=[new Le(1,0,0),new Le(-1,0,0),new Le(0,1,0),new Le(0,-1,0),new Le(0,0,1),new Le(0,0,-1)],pd=[new Le(0,-1,0),new Le(0,-1,0),new Le(0,0,1),new Le(0,0,-1),new Le(0,-1,0),new Le(0,-1,0)],Wr=new yt,vn=new Le,ri=new Le;function hd(e,n,t){let i=new jr;const a=new _t,r=new _t,o=new Et,c=new go,l=new vo,d={},_=t.maxTextureSize,g={[un]:xt,[xt]:un,[It]:It},p=new kt({defines:{VSM_SAMPLES:8},uniforms:{shadow_pass:{value:null},resolution:{value:new _t},radius:{value:4}},vertexShader:fd,fragmentShader:ud}),v=p.clone();v.defines.HORIZONTAL_PASS=1;const A=new en;A.setAttribute("position",new Qt(new Float32Array([-1,-1,.5,3,-1,.5,-1,3,.5]),3));const U=new Ot(A,p),h=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=Dn;let f=this.type;this.render=function(x,L,m){if(h.enabled===!1||h.autoUpdate===!1&&h.needsUpdate===!1||x.length===0)return;this.type===So&&(ze("WebGLShadowMap: PCFSoftShadowMap has been removed. Using PCFShadowMap instead."),this.type=Dn);const T=e.getRenderTarget(),y=e.getActiveCubeFace(),G=e.getActiveMipmapLevel(),k=e.state;k.setBlending(Ht),k.buffers.depth.getReversed()===!0?k.buffers.color.setClear(0,0,0,0):k.buffers.color.setClear(1,1,1,1),k.buffers.depth.setTest(!0),k.setScissorTest(!1);const q=f!==this.type;q&&L.traverse(function(N){N.material&&(Array.isArray(N.material)?N.material.forEach(K=>K.needsUpdate=!0):N.material.needsUpdate=!0)});for(let N=0,K=x.length;N<K;N++){const j=x[N],Y=j.shadow;if(Y===void 0){ze("WebGLShadowMap:",j,"has no shadow.");continue}if(Y.autoUpdate===!1&&Y.needsUpdate===!1)continue;a.copy(Y.mapSize);const ne=Y.getFrameExtents();a.multiply(ne),r.copy(Y.mapSize),(a.x>_||a.y>_)&&(a.x>_&&(r.x=Math.floor(_/ne.x),a.x=r.x*ne.x,Y.mapSize.x=r.x),a.y>_&&(r.y=Math.floor(_/ne.y),a.y=r.y*ne.y,Y.mapSize.y=r.y));const Z=e.state.buffers.depth.getReversed();if(Y.camera._reversedDepth=Z,Y.map===null||q===!0){if(Y.map!==null&&(Y.map.depthTexture!==null&&(Y.map.depthTexture.dispose(),Y.map.depthTexture=null),Y.map.dispose()),this.type===xn){if(j.isPointLight){ze("WebGLShadowMap: VSM shadow maps are not supported for PointLights. Use PCF or BasicShadowMap instead.");continue}Y.map=new Rt(a.x,a.y,{format:dn,type:Vt,minFilter:mt,magFilter:mt,generateMipmaps:!1}),Y.map.texture.name=j.name+".shadowMap",Y.map.depthTexture=new Fn(a.x,a.y,qt),Y.map.depthTexture.name=j.name+".shadowMapDepth",Y.map.depthTexture.format=pn,Y.map.depthTexture.compareFunction=null,Y.map.depthTexture.minFilter=Bt,Y.map.depthTexture.magFilter=Bt}else j.isPointLight?(Y.map=new Ca(a.x),Y.map.depthTexture=new Eo(a.x,Jt)):(Y.map=new Rt(a.x,a.y),Y.map.depthTexture=new Fn(a.x,a.y,Jt)),Y.map.depthTexture.name=j.name+".shadowMap",Y.map.depthTexture.format=pn,this.type===Dn?(Y.map.depthTexture.compareFunction=Z?gi:vi,Y.map.depthTexture.minFilter=mt,Y.map.depthTexture.magFilter=mt):(Y.map.depthTexture.compareFunction=null,Y.map.depthTexture.minFilter=Bt,Y.map.depthTexture.magFilter=Bt);Y.camera.updateProjectionMatrix()}Y.map.isWebGLCubeRenderTarget!==!0&&(Y.map.width!==a.x||Y.map.height!==a.y)&&Y.map.setSize(a.x,a.y);const J=Y.map.isWebGLCubeRenderTarget?6:Y.getViewportCount();j.isPointLight!==!0&&Y.updateMatrices(j,m);for(let ee=0;ee<J;ee++){const be=Y.getCamera(ee);if(j.isPointLight){const Re=Y.camera,rt=Y.matrix,Xe=j.distance||Re.far;Xe!==Re.far&&(Re.far=Xe,Re.updateProjectionMatrix()),vn.setFromMatrixPosition(j.matrixWorld),Re.position.copy(vn),ri.copy(Re.position),ri.add(dd[ee]),Re.up.copy(pd[ee]),Re.lookAt(ri),Re.updateMatrixWorld(),rt.makeTranslation(-vn.x,-vn.y,-vn.z),Wr.multiplyMatrices(Re.projectionMatrix,Re.matrixWorldInverse),Y._frustum.setFromProjectionMatrix(Wr,Re.coordinateSystem,Re.reversedDepth)}if(Y.map.isWebGLCubeRenderTarget)e.setRenderTarget(Y.map,ee),e.clear();else{ee===0&&(e.setRenderTarget(Y.map),e.clear());const Re=Y.getViewport(ee);o.set(r.x*Re.x,r.y*Re.y,r.x*Re.z,r.y*Re.w),k.viewport(o)}i=Y.getFrustum(ee),E(L,m,be,j,this.type)}Y.isPointLightShadow!==!0&&this.type===xn&&P(Y,m),Y.needsUpdate=!1}f=this.type,h.needsUpdate=!1,e.setRenderTarget(T,y,G)};function P(x,L){const m=n.update(U);p.defines.VSM_SAMPLES!==x.blurSamples&&(p.defines.VSM_SAMPLES=x.blurSamples,v.defines.VSM_SAMPLES=x.blurSamples,p.needsUpdate=!0,v.needsUpdate=!0),x.mapPass===null?x.mapPass=new Rt(a.x,a.y,{format:dn,type:Vt}):(x.mapPass.width!==x.map.width||x.mapPass.height!==x.map.height)&&x.mapPass.setSize(x.map.width,x.map.height),p.uniforms.shadow_pass.value=x.map.depthTexture,p.uniforms.resolution.value.set(x.map.width,x.map.height),p.uniforms.radius.value=x.radius,e.setRenderTarget(x.mapPass),e.clear(),e.renderBufferDirect(L,null,m,p,U,null),v.uniforms.shadow_pass.value=x.mapPass.texture,v.uniforms.resolution.value.set(x.map.width,x.map.height),v.uniforms.radius.value=x.radius,e.setRenderTarget(x.map),e.clear(),e.renderBufferDirect(L,null,m,v,U,null)}function F(x,L,m,T){let y=null;const G=m.isPointLight===!0?x.customDistanceMaterial:x.customDepthMaterial;if(G!==void 0)y=G;else if(y=m.isPointLight===!0?l:c,e.localClippingEnabled&&L.clipShadows===!0&&Array.isArray(L.clippingPlanes)&&L.clippingPlanes.length!==0||L.displacementMap&&L.displacementScale!==0||L.alphaMap&&L.alphaTest>0||L.map&&L.alphaTest>0||L.alphaToCoverage===!0){const k=y.uuid,q=L.uuid;let N=d[k];N===void 0&&(N={},d[k]=N);let K=N[q];K===void 0&&(K=y.clone(),N[q]=K,L.addEventListener("dispose",M)),y=K}if(y.visible=L.visible,y.wireframe=L.wireframe,T===xn?y.side=L.shadowSide!==null?L.shadowSide:L.side:y.side=L.shadowSide!==null?L.shadowSide:g[L.side],y.alphaMap=L.alphaMap,y.alphaTest=L.alphaToCoverage===!0?.5:L.alphaTest,y.map=L.map,y.clipShadows=L.clipShadows,y.clippingPlanes=L.clippingPlanes,y.clipIntersection=L.clipIntersection,y.displacementMap=L.displacementMap,y.displacementScale=L.displacementScale,y.displacementBias=L.displacementBias,y.wireframeLinewidth=L.wireframeLinewidth,y.linewidth=L.linewidth,m.isPointLight===!0&&y.isMeshDistanceMaterial===!0){const k=e.properties.get(y);k.light=m}return y}function E(x,L,m,T,y){if(x.visible===!1)return;if(x.layers.test(L.layers)&&(x.isMesh||x.isLine||x.isPoints)&&(x.castShadow||x.receiveShadow&&y===xn)&&(!x.frustumCulled||x.intersectsFrustum(i))){x.modelViewMatrix.multiplyMatrices(m.matrixWorldInverse,x.matrixWorld);const q=n.update(x),N=x.material;if(Array.isArray(N)){const K=q.groups;for(let j=0,Y=K.length;j<Y;j++){const ne=K[j],Z=N[ne.materialIndex];if(Z&&Z.visible){const J=F(x,Z,T,y);x.onBeforeShadow(e,x,L,m,q,J,ne),e.renderBufferDirect(m,null,q,J,x,ne),x.onAfterShadow(e,x,L,m,q,J,ne)}}}else if(N.visible){const K=F(x,N,T,y);x.onBeforeShadow(e,x,L,m,q,K,null),e.renderBufferDirect(m,null,q,K,x,null),x.onAfterShadow(e,x,L,m,q,K,null)}}const k=x.children;for(let q=0,N=k.length;q<N;q++)E(k[q],L,m,T,y)}function M(x){x.target.removeEventListener("dispose",M);for(const m in d){const T=d[m],y=x.target.uuid;y in T&&(T[y].dispose(),delete T[y])}}}function md(e,n){function t(){let b=!1;const oe=new Et;let z=null;const se=new Et(0,0,0,0);return{setMask:function(de){z!==de&&!b&&(e.colorMask(de,de,de,de),z=de)},setLocked:function(de){b=de},setClear:function(de,Q,Te,ve,$e){$e===!0&&(de*=ve,Q*=ve,Te*=ve),oe.set(de,Q,Te,ve),se.equals(oe)===!1&&(e.clearColor(de,Q,Te,ve),se.copy(oe))},reset:function(){b=!1,z=null,se.set(-1,0,0,0)}}}function i(){let b=!1,oe=!1,z=null,se=null,de=null;return{setReversed:function(Q){if(oe!==Q){const Te=n.get("EXT_clip_control");Q?Te.clipControlEXT(Te.LOWER_LEFT_EXT,Te.ZERO_TO_ONE_EXT):Te.clipControlEXT(Te.LOWER_LEFT_EXT,Te.NEGATIVE_ONE_TO_ONE_EXT),oe=Q;const ve=de;de=null,this.setClear(ve)}},getReversed:function(){return oe},setTest:function(Q){Q?$(e.DEPTH_TEST):Ee(e.DEPTH_TEST)},setMask:function(Q){z!==Q&&!b&&(e.depthMask(Q),z=Q)},setFunc:function(Q){if(oe&&(Q=ts[Q]),se!==Q){switch(Q){case Io:e.depthFunc(e.NEVER);break;case Do:e.depthFunc(e.ALWAYS);break;case Uo:e.depthFunc(e.LESS);break;case Ii:e.depthFunc(e.LEQUAL);break;case wo:e.depthFunc(e.EQUAL);break;case Po:e.depthFunc(e.GEQUAL);break;case Lo:e.depthFunc(e.GREATER);break;case Co:e.depthFunc(e.NOTEQUAL);break;default:e.depthFunc(e.LEQUAL)}se=Q}},setLocked:function(Q){b=Q},setClear:function(Q){de!==Q&&(de=Q,oe&&(Q=1-Q),e.clearDepth(Q))},reset:function(){b=!1,z=null,se=null,de=null,oe=!1}}}function a(){let b=!1,oe=null,z=null,se=null,de=null,Q=null,Te=null,ve=null,$e=null;return{setTest:function(Ve){b||(Ve?$(e.STENCIL_TEST):Ee(e.STENCIL_TEST))},setMask:function(Ve){oe!==Ve&&!b&&(e.stencilMask(Ve),oe=Ve)},setFunc:function(Ve,At,Ct){(z!==Ve||se!==At||de!==Ct)&&(e.stencilFunc(Ve,At,Ct),z=Ve,se=At,de=Ct)},setOp:function(Ve,At,Ct){(Q!==Ve||Te!==At||ve!==Ct)&&(e.stencilOp(Ve,At,Ct),Q=Ve,Te=At,ve=Ct)},setLocked:function(Ve){b=Ve},setClear:function(Ve){$e!==Ve&&(e.clearStencil(Ve),$e=Ve)},reset:function(){b=!1,oe=null,z=null,se=null,de=null,Q=null,Te=null,ve=null,$e=null}}}const r=new t,o=new i,c=new a,l=new WeakMap,d=new WeakMap;let _={},g={},p={},v=new WeakMap,A=[],U=null,h=!1,f=null,P=null,F=null,E=null,M=null,x=null,L=null,m=new He(0,0,0),T=0,y=!1,G=null,k=null,q=null,N=null,K=null;const j=e.getParameter(e.MAX_COMBINED_TEXTURE_IMAGE_UNITS);let Y=!1,ne=0;const Z=e.getParameter(e.VERSION);Z.indexOf("WebGL")!==-1?(ne=parseFloat(/^WebGL (\d)/.exec(Z)[1]),Y=ne>=1):Z.indexOf("OpenGL ES")!==-1&&(ne=parseFloat(/^OpenGL ES (\d)/.exec(Z)[1]),Y=ne>=2);let J=null,ee={};const be=e.getParameter(e.SCISSOR_BOX),Re=e.getParameter(e.VIEWPORT),rt=new Et().fromArray(be),Xe=new Et().fromArray(Re);function Ke(b,oe,z,se){const de=new Uint8Array(4),Q=e.createTexture();e.bindTexture(b,Q),e.texParameteri(b,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(b,e.TEXTURE_MAG_FILTER,e.NEAREST);for(let Te=0;Te<z;Te++)b===e.TEXTURE_3D||b===e.TEXTURE_2D_ARRAY?e.texImage3D(oe,0,e.RGBA,1,1,se,0,e.RGBA,e.UNSIGNED_BYTE,de):e.texImage2D(oe+Te,0,e.RGBA,1,1,0,e.RGBA,e.UNSIGNED_BYTE,de);return Q}const W={};W[e.TEXTURE_2D]=Ke(e.TEXTURE_2D,e.TEXTURE_2D,1),W[e.TEXTURE_CUBE_MAP]=Ke(e.TEXTURE_CUBE_MAP,e.TEXTURE_CUBE_MAP_POSITIVE_X,6),W[e.TEXTURE_2D_ARRAY]=Ke(e.TEXTURE_2D_ARRAY,e.TEXTURE_2D_ARRAY,1,1),W[e.TEXTURE_3D]=Ke(e.TEXTURE_3D,e.TEXTURE_3D,1,1),r.setClear(0,0,0,1),o.setClear(1),c.setClear(0),$(e.DEPTH_TEST),o.setFunc(Ii),ye(!1),nt(yi),$(e.CULL_FACE),Ge(Ht);function $(b){_[b]!==!0&&(e.enable(b),_[b]=!0)}function Ee(b){_[b]!==!1&&(e.disable(b),_[b]=!1)}function Ue(b,oe){return p[b]!==oe?(e.bindFramebuffer(b,oe),p[b]=oe,b===e.DRAW_FRAMEBUFFER&&(p[e.FRAMEBUFFER]=oe),b===e.FRAMEBUFFER&&(p[e.DRAW_FRAMEBUFFER]=oe),!0):!1}function me(b,oe){let z=A,se=!1;if(b){z=v.get(oe),z===void 0&&(z=[],v.set(oe,z));const de=b.textures;if(z.length!==de.length||z[0]!==e.COLOR_ATTACHMENT0){for(let Q=0,Te=de.length;Q<Te;Q++)z[Q]=e.COLOR_ATTACHMENT0+Q;z.length=de.length,se=!0}}else z[0]!==e.BACK&&(z[0]=e.BACK,se=!0);se&&e.drawBuffers(z)}function Oe(b){return U!==b?(e.useProgram(b),U=b,!0):!1}const lt={[_n]:e.FUNC_ADD,[Ya]:e.FUNC_SUBTRACT,[Ka]:e.FUNC_REVERSE_SUBTRACT};lt[ns]=e.MIN,lt[is]=e.MAX;const Ie={[co]:e.ZERO,[so]:e.ONE,[oo]:e.SRC_COLOR,[ao]:e.SRC_ALPHA,[ro]:e.SRC_ALPHA_SATURATE,[io]:e.DST_COLOR,[no]:e.DST_ALPHA,[to]:e.ONE_MINUS_SRC_COLOR,[eo]:e.ONE_MINUS_SRC_ALPHA,[Ja]:e.ONE_MINUS_DST_COLOR,[Qa]:e.ONE_MINUS_DST_ALPHA,[ja]:e.CONSTANT_COLOR,[$a]:e.ONE_MINUS_CONSTANT_COLOR,[Za]:e.CONSTANT_ALPHA,[qa]:e.ONE_MINUS_CONSTANT_ALPHA};function Ge(b,oe,z,se,de,Q,Te,ve,$e,Ve){if(b===Ht){h===!0&&(Ee(e.BLEND),h=!1);return}if(h===!1&&($(e.BLEND),h=!0),b!==Oo){if(b!==f||Ve!==y){if((P!==_n||M!==_n)&&(e.blendEquation(e.FUNC_ADD),P=_n,M=_n),Ve)switch(b){case In:e.blendFuncSeparate(e.ONE,e.ONE_MINUS_SRC_ALPHA,e.ONE,e.ONE_MINUS_SRC_ALPHA);break;case Bi:e.blendFunc(e.ONE,e.ONE);break;case Fi:e.blendFuncSeparate(e.ZERO,e.ONE_MINUS_SRC_COLOR,e.ZERO,e.ONE);break;case Oi:e.blendFuncSeparate(e.DST_COLOR,e.ONE_MINUS_SRC_ALPHA,e.ZERO,e.ONE);break;default:et("WebGLState: Invalid blending: ",b);break}else switch(b){case In:e.blendFuncSeparate(e.SRC_ALPHA,e.ONE_MINUS_SRC_ALPHA,e.ONE,e.ONE_MINUS_SRC_ALPHA);break;case Bi:e.blendFuncSeparate(e.SRC_ALPHA,e.ONE,e.ONE,e.ONE);break;case Fi:et("WebGLState: SubtractiveBlending requires material.premultipliedAlpha = true");break;case Oi:et("WebGLState: MultiplyBlending requires material.premultipliedAlpha = true");break;default:et("WebGLState: Invalid blending: ",b);break}F=null,E=null,x=null,L=null,m.set(0,0,0),T=0,f=b,y=Ve}return}de=de||oe,Q=Q||z,Te=Te||se,(oe!==P||de!==M)&&(e.blendEquationSeparate(lt[oe],lt[de]),P=oe,M=de),(z!==F||se!==E||Q!==x||Te!==L)&&(e.blendFuncSeparate(Ie[z],Ie[se],Ie[Q],Ie[Te]),F=z,E=se,x=Q,L=Te),(ve.equals(m)===!1||$e!==T)&&(e.blendColor(ve.r,ve.g,ve.b,$e),m.copy(ve),T=$e),f=b,y=!1}function Ze(b,oe){b.side===It?Ee(e.CULL_FACE):$(e.CULL_FACE);let z=b.side===xt;oe&&(z=!z),ye(z),b.blending===In&&b.transparent===!1?Ge(Ht):Ge(b.blending,b.blendEquation,b.blendSrc,b.blendDst,b.blendEquationAlpha,b.blendSrcAlpha,b.blendDstAlpha,b.blendColor,b.blendAlpha,b.premultipliedAlpha),o.setFunc(b.depthFunc),o.setTest(b.depthTest),o.setMask(b.depthWrite),r.setMask(b.colorWrite);const se=b.stencilWrite;c.setTest(se),se&&(c.setMask(b.stencilWriteMask),c.setFunc(b.stencilFunc,b.stencilRef,b.stencilFuncMask),c.setOp(b.stencilFail,b.stencilZFail,b.stencilZPass)),vt(b.polygonOffset,b.polygonOffsetFactor,b.polygonOffsetUnits),b.alphaToCoverage===!0?$(e.SAMPLE_ALPHA_TO_COVERAGE):Ee(e.SAMPLE_ALPHA_TO_COVERAGE)}function ye(b){G!==b&&(b?e.frontFace(e.CW):e.frontFace(e.CCW),G=b)}function nt(b){b!==No?($(e.CULL_FACE),b!==k&&(b===yi?e.cullFace(e.BACK):b===yo?e.cullFace(e.FRONT):e.cullFace(e.FRONT_AND_BACK))):Ee(e.CULL_FACE),k=b}function dt(b){b!==q&&(Y&&e.lineWidth(b),q=b)}function vt(b,oe,z){b?($(e.POLYGON_OFFSET_FILL),(N!==oe||K!==z)&&(N=oe,K=z,o.getReversed()&&(oe=-oe),e.polygonOffset(oe,z))):Ee(e.POLYGON_OFFSET_FILL)}function it(b){b?$(e.SCISSOR_TEST):Ee(e.SCISSOR_TEST)}function st(b){b===void 0&&(b=e.TEXTURE0+j-1),J!==b&&(e.activeTexture(b),J=b)}function C(b,oe,z){z===void 0&&(J===null?z=e.TEXTURE0+j-1:z=J);let se=ee[z];se===void 0&&(se={type:void 0,texture:void 0},ee[z]=se),(se.type!==b||se.texture!==oe)&&(J!==z&&(e.activeTexture(z),J=z),e.bindTexture(b,oe||W[b]),se.type=b,se.texture=oe)}function pt(){const b=ee[J];b!==void 0&&b.type!==void 0&&(e.bindTexture(b.type,null),b.type=void 0,b.texture=void 0)}function We(){try{e.compressedTexImage2D(...arguments)}catch(b){et("WebGLState:",b)}}function S(){try{e.compressedTexImage3D(...arguments)}catch(b){et("WebGLState:",b)}}function s(){try{e.texSubImage2D(...arguments)}catch(b){et("WebGLState:",b)}}function w(){try{e.texSubImage3D(...arguments)}catch(b){et("WebGLState:",b)}}function O(){try{e.compressedTexSubImage2D(...arguments)}catch(b){et("WebGLState:",b)}}function H(){try{e.compressedTexSubImage3D(...arguments)}catch(b){et("WebGLState:",b)}}function te(){try{e.texStorage2D(...arguments)}catch(b){et("WebGLState:",b)}}function ie(){try{e.texStorage3D(...arguments)}catch(b){et("WebGLState:",b)}}function V(){try{e.texImage2D(...arguments)}catch(b){et("WebGLState:",b)}}function X(){try{e.texImage3D(...arguments)}catch(b){et("WebGLState:",b)}}function re(b){return g[b]!==void 0?g[b]:e.getParameter(b)}function xe(b,oe){g[b]!==oe&&(e.pixelStorei(b,oe),g[b]=oe)}function ce(b){rt.equals(b)===!1&&(e.scissor(b.x,b.y,b.z,b.w),rt.copy(b))}function ae(b){Xe.equals(b)===!1&&(e.viewport(b.x,b.y,b.z,b.w),Xe.copy(b))}function Me(b,oe){let z=d.get(oe);z===void 0&&(z=new WeakMap,d.set(oe,z));let se=z.get(b);se===void 0&&(se=e.getUniformBlockIndex(oe,b.name),z.set(b,se))}function Ae(b,oe){const se=d.get(oe).get(b);l.get(oe)!==se&&(e.uniformBlockBinding(oe,se,b.__bindingPointIndex),l.set(oe,se))}function Ce(){e.disable(e.BLEND),e.disable(e.CULL_FACE),e.disable(e.DEPTH_TEST),e.disable(e.POLYGON_OFFSET_FILL),e.disable(e.SCISSOR_TEST),e.disable(e.STENCIL_TEST),e.disable(e.SAMPLE_ALPHA_TO_COVERAGE),e.blendEquation(e.FUNC_ADD),e.blendFunc(e.ONE,e.ZERO),e.blendFuncSeparate(e.ONE,e.ZERO,e.ONE,e.ZERO),e.blendColor(0,0,0,0),e.colorMask(!0,!0,!0,!0),e.clearColor(0,0,0,0),e.depthMask(!0),e.depthFunc(e.LESS),o.setReversed(!1),e.clearDepth(1),e.stencilMask(4294967295),e.stencilFunc(e.ALWAYS,0,4294967295),e.stencilOp(e.KEEP,e.KEEP,e.KEEP),e.clearStencil(0),e.cullFace(e.BACK),e.frontFace(e.CCW),e.polygonOffset(0,0),e.activeTexture(e.TEXTURE0),e.bindFramebuffer(e.FRAMEBUFFER,null),e.bindFramebuffer(e.DRAW_FRAMEBUFFER,null),e.bindFramebuffer(e.READ_FRAMEBUFFER,null),e.useProgram(null),e.lineWidth(1),e.scissor(0,0,e.canvas.width,e.canvas.height),e.viewport(0,0,e.canvas.width,e.canvas.height),e.pixelStorei(e.PACK_ALIGNMENT,4),e.pixelStorei(e.UNPACK_ALIGNMENT,4),e.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,!1),e.pixelStorei(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!1),e.pixelStorei(e.UNPACK_COLORSPACE_CONVERSION_WEBGL,e.BROWSER_DEFAULT_WEBGL),e.pixelStorei(e.PACK_ROW_LENGTH,0),e.pixelStorei(e.PACK_SKIP_PIXELS,0),e.pixelStorei(e.PACK_SKIP_ROWS,0),e.pixelStorei(e.UNPACK_ROW_LENGTH,0),e.pixelStorei(e.UNPACK_IMAGE_HEIGHT,0),e.pixelStorei(e.UNPACK_SKIP_PIXELS,0),e.pixelStorei(e.UNPACK_SKIP_ROWS,0),e.pixelStorei(e.UNPACK_SKIP_IMAGES,0),_={},g={},J=null,ee={},p={},v=new WeakMap,A=[],U=null,h=!1,f=null,P=null,F=null,E=null,M=null,x=null,L=null,m=new He(0,0,0),T=0,y=!1,G=null,k=null,q=null,N=null,K=null,rt.set(0,0,e.canvas.width,e.canvas.height),Xe.set(0,0,e.canvas.width,e.canvas.height),r.reset(),o.reset(),c.reset()}return{buffers:{color:r,depth:o,stencil:c},enable:$,disable:Ee,bindFramebuffer:Ue,drawBuffers:me,useProgram:Oe,setBlending:Ge,setMaterial:Ze,setFlipSided:ye,setCullFace:nt,setLineWidth:dt,setPolygonOffset:vt,setScissorTest:it,activeTexture:st,bindTexture:C,unbindTexture:pt,compressedTexImage2D:We,compressedTexImage3D:S,texImage2D:V,texImage3D:X,pixelStorei:xe,getParameter:re,updateUBOMapping:Me,uniformBlockBinding:Ae,texStorage2D:te,texStorage3D:ie,texSubImage2D:s,texSubImage3D:w,compressedTexSubImage2D:O,compressedTexSubImage3D:H,scissor:ce,viewport:ae,reset:Ce}}function _d(e,n,t,i,a,r,o){const c=n.has("WEBGL_multisampled_render_to_texture")?n.get("WEBGL_multisampled_render_to_texture"):null,l=typeof navigator>"u"?!1:/OculusBrowser/g.test(navigator.userAgent),d=new _t,_=new WeakMap,g=new Set;let p;const v=new WeakMap;let A=!1;try{A=typeof OffscreenCanvas<"u"&&new OffscreenCanvas(1,1).getContext("2d")!==null}catch{}function U(S,s){return A?new OffscreenCanvas(S,s):$o("canvas")}function h(S,s,w){let O=1;const H=We(S);if((H.width>w||H.height>w)&&(O=w/Math.max(H.width,H.height)),O<1)if(typeof HTMLImageElement<"u"&&S instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&S instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&S instanceof ImageBitmap||typeof VideoFrame<"u"&&S instanceof VideoFrame){const te=Math.floor(O*H.width),ie=Math.floor(O*H.height);p===void 0&&(p=U(te,ie));const V=s?U(te,ie):p;return V.width=te,V.height=ie,V.getContext("2d").drawImage(S,0,0,te,ie),ze("WebGLRenderer: Texture has been resized from ("+H.width+"x"+H.height+") to ("+te+"x"+ie+")."),V}else return"data"in S&&ze("WebGLRenderer: Image in DataTexture is too big ("+H.width+"x"+H.height+")."),S;return S}function f(S){return S.generateMipmaps}function P(S){e.generateMipmap(S)}function F(S){return S.isWebGLCubeRenderTarget?e.TEXTURE_CUBE_MAP:S.isWebGL3DRenderTarget?e.TEXTURE_3D:S.isWebGLArrayRenderTarget||S.isCompressedArrayTexture?e.TEXTURE_2D_ARRAY:e.TEXTURE_2D}function E(S,s,w,O,H,te=!1){if(S!==null){if(e[S]!==void 0)return e[S];ze("WebGLRenderer: Attempt to use non-existing WebGL internal format '"+S+"'")}let ie;O&&(ie=n.get("EXT_texture_norm16"),ie||ze("WebGLRenderer: Unable to use normalized textures without EXT_texture_norm16 extension"));let V=s;if(s===e.RED&&(w===e.FLOAT&&(V=e.R32F),w===e.HALF_FLOAT&&(V=e.R16F),w===e.UNSIGNED_BYTE&&(V=e.R8),w===e.UNSIGNED_SHORT&&ie&&(V=ie.R16_EXT),w===e.SHORT&&ie&&(V=ie.R16_SNORM_EXT)),s===e.RED_INTEGER&&(w===e.UNSIGNED_BYTE&&(V=e.R8UI),w===e.UNSIGNED_SHORT&&(V=e.R16UI),w===e.UNSIGNED_INT&&(V=e.R32UI),w===e.BYTE&&(V=e.R8I),w===e.SHORT&&(V=e.R16I),w===e.INT&&(V=e.R32I)),s===e.RG&&(w===e.FLOAT&&(V=e.RG32F),w===e.HALF_FLOAT&&(V=e.RG16F),w===e.UNSIGNED_BYTE&&(V=e.RG8),w===e.UNSIGNED_SHORT&&ie&&(V=ie.RG16_EXT),w===e.SHORT&&ie&&(V=ie.RG16_SNORM_EXT)),s===e.RG_INTEGER&&(w===e.UNSIGNED_BYTE&&(V=e.RG8UI),w===e.UNSIGNED_SHORT&&(V=e.RG16UI),w===e.UNSIGNED_INT&&(V=e.RG32UI),w===e.BYTE&&(V=e.RG8I),w===e.SHORT&&(V=e.RG16I),w===e.INT&&(V=e.RG32I)),s===e.RGB_INTEGER&&(w===e.UNSIGNED_BYTE&&(V=e.RGB8UI),w===e.UNSIGNED_SHORT&&(V=e.RGB16UI),w===e.UNSIGNED_INT&&(V=e.RGB32UI),w===e.BYTE&&(V=e.RGB8I),w===e.SHORT&&(V=e.RGB16I),w===e.INT&&(V=e.RGB32I)),s===e.RGBA_INTEGER&&(w===e.UNSIGNED_BYTE&&(V=e.RGBA8UI),w===e.UNSIGNED_SHORT&&(V=e.RGBA16UI),w===e.UNSIGNED_INT&&(V=e.RGBA32UI),w===e.BYTE&&(V=e.RGBA8I),w===e.SHORT&&(V=e.RGBA16I),w===e.INT&&(V=e.RGBA32I)),s===e.RGB&&(w===e.UNSIGNED_SHORT&&ie&&(V=ie.RGB16_EXT),w===e.SHORT&&ie&&(V=ie.RGB16_SNORM_EXT),w===e.UNSIGNED_INT_5_9_9_9_REV&&(V=e.RGB9_E5),w===e.UNSIGNED_INT_10F_11F_11F_REV&&(V=e.R11F_G11F_B10F)),s===e.RGBA){const X=te?ua:tt.getTransfer(H);w===e.FLOAT&&(V=e.RGBA32F),w===e.HALF_FLOAT&&(V=e.RGBA16F),w===e.UNSIGNED_BYTE&&(V=X===Qe?e.SRGB8_ALPHA8:e.RGBA8),w===e.UNSIGNED_SHORT&&ie&&(V=ie.RGBA16_EXT),w===e.SHORT&&ie&&(V=ie.RGBA16_SNORM_EXT),w===e.UNSIGNED_SHORT_4_4_4_4&&(V=e.RGBA4),w===e.UNSIGNED_SHORT_5_5_5_1&&(V=e.RGB5_A1)}return(V===e.R16F||V===e.R32F||V===e.RG16F||V===e.RG32F||V===e.RGBA16F||V===e.RGBA32F)&&n.get("EXT_color_buffer_float"),V}function M(S,s){let w;return S?s===null||s===Jt||s===Rn?w=e.DEPTH24_STENCIL8:s===qt?w=e.DEPTH32F_STENCIL8:s===Bn&&(w=e.DEPTH24_STENCIL8,ze("DepthTexture: 16 bit depth attachment is not supported with stencil. Using 24-bit attachment.")):s===null||s===Jt||s===Rn?w=e.DEPTH_COMPONENT24:s===qt?w=e.DEPTH_COMPONENT32F:s===Bn&&(w=e.DEPTH_COMPONENT16),w}function x(S,s){return f(S)===!0||S.isFramebufferTexture&&S.minFilter!==Bt&&S.minFilter!==mt?Math.log2(Math.max(s.width,s.height))+1:S.mipmaps!==void 0&&S.mipmaps.length>0?S.mipmaps.length:S.isCompressedTexture&&Array.isArray(S.image)?s.mipmaps.length:1}function L(S){const s=S.target;s.removeEventListener("dispose",L),T(s),s.isVideoTexture&&_.delete(s),s.isHTMLTexture&&g.delete(s)}function m(S){const s=S.target;s.removeEventListener("dispose",m),G(s)}function T(S){const s=i.get(S);if(s.__webglInit===void 0)return;const w=S.source,O=v.get(w);if(O){const H=O[s.__cacheKey];H.usedTimes--,H.usedTimes===0&&y(S),Object.keys(O).length===0&&v.delete(w)}i.remove(S)}function y(S){const s=i.get(S);e.deleteTexture(s.__webglTexture);const w=S.source,O=v.get(w);delete O[s.__cacheKey],o.memory.textures--}function G(S){const s=i.get(S);if(S.depthTexture&&(S.depthTexture.dispose(),i.remove(S.depthTexture)),S.isWebGLCubeRenderTarget)for(let O=0;O<6;O++){if(Array.isArray(s.__webglFramebuffer[O]))for(let H=0;H<s.__webglFramebuffer[O].length;H++)e.deleteFramebuffer(s.__webglFramebuffer[O][H]);else e.deleteFramebuffer(s.__webglFramebuffer[O]);s.__webglDepthbuffer&&e.deleteRenderbuffer(s.__webglDepthbuffer[O])}else{if(Array.isArray(s.__webglFramebuffer))for(let O=0;O<s.__webglFramebuffer.length;O++)e.deleteFramebuffer(s.__webglFramebuffer[O]);else e.deleteFramebuffer(s.__webglFramebuffer);if(s.__webglDepthbuffer&&e.deleteRenderbuffer(s.__webglDepthbuffer),s.__webglMultisampledFramebuffer&&e.deleteFramebuffer(s.__webglMultisampledFramebuffer),s.__webglColorRenderbuffer)for(let O=0;O<s.__webglColorRenderbuffer.length;O++)s.__webglColorRenderbuffer[O]&&e.deleteRenderbuffer(s.__webglColorRenderbuffer[O]);s.__webglDepthRenderbuffer&&e.deleteRenderbuffer(s.__webglDepthRenderbuffer)}const w=S.textures;for(let O=0,H=w.length;O<H;O++){const te=i.get(w[O]);te.__webglTexture&&(e.deleteTexture(te.__webglTexture),o.memory.textures--),i.remove(w[O])}i.remove(S)}let k=0;function q(){k=0}function N(){return k}function K(S){k=S}function j(){const S=k;return S>=a.maxTextures&&ze("WebGLTextures: Trying to use "+(S+1)+" texture units while this GPU supports only "+a.maxTextures),k+=1,S}function Y(S){const s=[];return s.push(S.wrapS),s.push(S.wrapT),s.push(S.wrapR||0),s.push(S.magFilter),s.push(S.minFilter),s.push(S.anisotropy),s.push(S.internalFormat),s.push(S.format),s.push(S.type),s.push(S.generateMipmaps),s.push(S.premultiplyAlpha),s.push(S.flipY),s.push(S.unpackAlignment),s.push(S.colorSpace),s.join()}function ne(S,s){const w=i.get(S);if(S.isVideoTexture&&C(S),S.isRenderTargetTexture===!1&&S.isExternalTexture!==!0&&S.version>0&&w.__version!==S.version){const O=S.image;if(O===null)ze("WebGLRenderer: Texture marked for update but no image data found.");else if(O.complete===!1)ze("WebGLRenderer: Texture marked for update but image is incomplete");else{Ee(w,S,s);return}}else S.isExternalTexture&&(w.__webglTexture=S.sourceTexture?S.sourceTexture:null);t.bindTexture(e.TEXTURE_2D,w.__webglTexture,e.TEXTURE0+s)}function Z(S,s){const w=i.get(S);if(S.isRenderTargetTexture===!1&&S.version>0&&w.__version!==S.version){Ee(w,S,s);return}else S.isExternalTexture&&(w.__webglTexture=S.sourceTexture?S.sourceTexture:null);t.bindTexture(e.TEXTURE_2D_ARRAY,w.__webglTexture,e.TEXTURE0+s)}function J(S,s){const w=i.get(S);if(S.isRenderTargetTexture===!1&&S.version>0&&w.__version!==S.version){Ee(w,S,s);return}t.bindTexture(e.TEXTURE_3D,w.__webglTexture,e.TEXTURE0+s)}function ee(S,s){const w=i.get(S);if(S.isCubeDepthTexture!==!0&&S.version>0&&w.__version!==S.version){Ue(w,S,s);return}t.bindTexture(e.TEXTURE_CUBE_MAP,w.__webglTexture,e.TEXTURE0+s)}const be={[On]:e.REPEAT,[yn]:e.CLAMP_TO_EDGE,[Qr]:e.MIRRORED_REPEAT},Re={[Bt]:e.NEAREST,[Jr]:e.NEAREST_MIPMAP_NEAREST,[En]:e.NEAREST_MIPMAP_LINEAR,[mt]:e.LINEAR,[Un]:e.LINEAR_MIPMAP_NEAREST,[Yt]:e.LINEAR_MIPMAP_LINEAR},rt={[mo]:e.NEVER,[ho]:e.ALWAYS,[po]:e.LESS,[vi]:e.LEQUAL,[uo]:e.EQUAL,[gi]:e.GEQUAL,[fo]:e.GREATER,[lo]:e.NOTEQUAL};function Xe(S,s){if(s.type===qt&&n.has("OES_texture_float_linear")===!1&&(s.magFilter===mt||s.magFilter===Un||s.magFilter===En||s.magFilter===Yt||s.minFilter===mt||s.minFilter===Un||s.minFilter===En||s.minFilter===Yt)&&ze("WebGLRenderer: Unable to use linear filtering with floating point textures. OES_texture_float_linear not supported on this device."),e.texParameteri(S,e.TEXTURE_WRAP_S,be[s.wrapS]),e.texParameteri(S,e.TEXTURE_WRAP_T,be[s.wrapT]),(S===e.TEXTURE_3D||S===e.TEXTURE_2D_ARRAY)&&e.texParameteri(S,e.TEXTURE_WRAP_R,be[s.wrapR]),e.texParameteri(S,e.TEXTURE_MAG_FILTER,Re[s.magFilter]),e.texParameteri(S,e.TEXTURE_MIN_FILTER,Re[s.minFilter]),s.compareFunction&&(e.texParameteri(S,e.TEXTURE_COMPARE_MODE,e.COMPARE_REF_TO_TEXTURE),e.texParameteri(S,e.TEXTURE_COMPARE_FUNC,rt[s.compareFunction])),n.has("EXT_texture_filter_anisotropic")===!0){if(s.magFilter===Bt||s.minFilter!==En&&s.minFilter!==Yt||s.type===qt&&n.has("OES_texture_float_linear")===!1)return;if(s.anisotropy>1||i.get(s).__currentAnisotropy){const w=n.get("EXT_texture_filter_anisotropic");e.texParameterf(S,w.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(s.anisotropy,a.getMaxAnisotropy())),i.get(s).__currentAnisotropy=s.anisotropy}}}function Ke(S,s){let w=!1;S.__webglInit===void 0&&(S.__webglInit=!0,s.addEventListener("dispose",L));const O=s.source;let H=v.get(O);H===void 0&&(H={},v.set(O,H));const te=Y(s);if(te!==S.__cacheKey){H[te]===void 0&&(H[te]={texture:e.createTexture(),usedTimes:0},o.memory.textures++,w=!0),H[te].usedTimes++;const ie=H[S.__cacheKey];ie!==void 0&&(H[S.__cacheKey].usedTimes--,ie.usedTimes===0&&y(s)),S.__cacheKey=te,S.__webglTexture=H[te].texture}return w}function W(S,s,w){return Math.floor(Math.floor(S/w)/s)}function $(S,s,w,O){const te=S.updateRanges;if(te.length===0)t.texSubImage2D(e.TEXTURE_2D,0,0,0,s.width,s.height,w,O,s.data);else{te.sort((xe,ce)=>xe.start-ce.start);let ie=0;for(let xe=1;xe<te.length;xe++){const ce=te[ie],ae=te[xe],Me=ce.start+ce.count,Ae=W(ae.start,s.width,4),Ce=W(ce.start,s.width,4);ae.start<=Me+1&&Ae===Ce&&W(ae.start+ae.count-1,s.width,4)===Ae?ce.count=Math.max(ce.count,ae.start+ae.count-ce.start):(++ie,te[ie]=ae)}te.length=ie+1;const V=t.getParameter(e.UNPACK_ROW_LENGTH),X=t.getParameter(e.UNPACK_SKIP_PIXELS),re=t.getParameter(e.UNPACK_SKIP_ROWS);t.pixelStorei(e.UNPACK_ROW_LENGTH,s.width);for(let xe=0,ce=te.length;xe<ce;xe++){const ae=te[xe],Me=Math.floor(ae.start/4),Ae=Math.ceil(ae.count/4),Ce=Me%s.width,b=Math.floor(Me/s.width),oe=Ae,z=1;t.pixelStorei(e.UNPACK_SKIP_PIXELS,Ce),t.pixelStorei(e.UNPACK_SKIP_ROWS,b),t.texSubImage2D(e.TEXTURE_2D,0,Ce,b,oe,z,w,O,s.data)}S.clearUpdateRanges(),t.pixelStorei(e.UNPACK_ROW_LENGTH,V),t.pixelStorei(e.UNPACK_SKIP_PIXELS,X),t.pixelStorei(e.UNPACK_SKIP_ROWS,re)}}function Ee(S,s,w){let O=e.TEXTURE_2D;(s.isDataArrayTexture||s.isCompressedArrayTexture)&&(O=e.TEXTURE_2D_ARRAY),s.isData3DTexture&&(O=e.TEXTURE_3D);const H=Ke(S,s),te=s.source;t.bindTexture(O,S.__webglTexture,e.TEXTURE0+w);const ie=i.get(te);if(te.version!==ie.__version||H===!0){if(t.activeTexture(e.TEXTURE0+w),(typeof ImageBitmap<"u"&&s.image instanceof ImageBitmap)===!1){const z=tt.getPrimaries(tt.workingColorSpace),se=s.colorSpace===an?null:tt.getPrimaries(s.colorSpace),de=s.colorSpace===an||z===se?e.NONE:e.BROWSER_DEFAULT_WEBGL;t.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,s.flipY),t.pixelStorei(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL,s.premultiplyAlpha),t.pixelStorei(e.UNPACK_COLORSPACE_CONVERSION_WEBGL,de)}t.pixelStorei(e.UNPACK_ALIGNMENT,s.unpackAlignment);let X=h(s.image,!1,a.maxTextureSize);X=pt(s,X);const re=r.convert(s.format,s.colorSpace),xe=r.convert(s.type);let ce=E(s.internalFormat,re,xe,s.normalized,s.colorSpace,s.isVideoTexture);Xe(O,s);let ae;const Me=s.mipmaps,Ae=s.isVideoTexture!==!0,Ce=ie.__version===void 0||H===!0,b=te.dataReady,oe=x(s,X);if(s.isDepthTexture)ce=M(s.format===on,s.type),Ce&&(Ae?t.texStorage2D(e.TEXTURE_2D,1,ce,X.width,X.height):t.texImage2D(e.TEXTURE_2D,0,ce,X.width,X.height,0,re,xe,null));else if(s.isDataTexture)if(Me.length>0){Ae&&Ce&&t.texStorage2D(e.TEXTURE_2D,oe,ce,Me[0].width,Me[0].height);for(let z=0,se=Me.length;z<se;z++)ae=Me[z],Ae?b&&t.texSubImage2D(e.TEXTURE_2D,z,0,0,ae.width,ae.height,re,xe,ae.data):t.texImage2D(e.TEXTURE_2D,z,ce,ae.width,ae.height,0,re,xe,ae.data);s.generateMipmaps=!1}else Ae?(Ce&&t.texStorage2D(e.TEXTURE_2D,oe,ce,X.width,X.height),b&&$(s,X,re,xe)):t.texImage2D(e.TEXTURE_2D,0,ce,X.width,X.height,0,re,xe,X.data);else if(s.isCompressedTexture)if(s.isCompressedArrayTexture){Ae&&Ce&&t.texStorage3D(e.TEXTURE_2D_ARRAY,oe,ce,Me[0].width,Me[0].height,X.depth);for(let z=0,se=Me.length;z<se;z++)if(ae=Me[z],s.format!==Gt)if(re!==null)if(Ae){if(b)if(s.layerUpdates.size>0){const de=_r(ae.width,ae.height,s.format,s.type);for(const Q of s.layerUpdates){const Te=ae.data.subarray(Q*de/ae.data.BYTES_PER_ELEMENT,(Q+1)*de/ae.data.BYTES_PER_ELEMENT);t.compressedTexSubImage3D(e.TEXTURE_2D_ARRAY,z,0,0,Q,ae.width,ae.height,1,re,Te)}}else t.compressedTexSubImage3D(e.TEXTURE_2D_ARRAY,z,0,0,0,ae.width,ae.height,X.depth,re,ae.data)}else t.compressedTexImage3D(e.TEXTURE_2D_ARRAY,z,ce,ae.width,ae.height,X.depth,0,ae.data,0,0);else ze("WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()");else Ae?b&&t.texSubImage3D(e.TEXTURE_2D_ARRAY,z,0,0,0,ae.width,ae.height,X.depth,re,xe,ae.data):t.texImage3D(e.TEXTURE_2D_ARRAY,z,ce,ae.width,ae.height,X.depth,0,re,xe,ae.data);s.layerUpdates.size>0&&s.clearLayerUpdates()}else{Ae&&Ce&&t.texStorage2D(e.TEXTURE_2D,oe,ce,Me[0].width,Me[0].height);for(let z=0,se=Me.length;z<se;z++)ae=Me[z],s.format!==Gt?re!==null?Ae?b&&t.compressedTexSubImage2D(e.TEXTURE_2D,z,0,0,ae.width,ae.height,re,ae.data):t.compressedTexImage2D(e.TEXTURE_2D,z,ce,ae.width,ae.height,0,ae.data):ze("WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()"):Ae?b&&t.texSubImage2D(e.TEXTURE_2D,z,0,0,ae.width,ae.height,re,xe,ae.data):t.texImage2D(e.TEXTURE_2D,z,ce,ae.width,ae.height,0,re,xe,ae.data)}else if(s.isDataArrayTexture)if(Ae){if(Ce&&t.texStorage3D(e.TEXTURE_2D_ARRAY,oe,ce,X.width,X.height,X.depth),b)if(s.layerUpdates.size>0){const z=_r(X.width,X.height,s.format,s.type);for(const se of s.layerUpdates){const de=X.data.subarray(se*z/X.data.BYTES_PER_ELEMENT,(se+1)*z/X.data.BYTES_PER_ELEMENT);t.texSubImage3D(e.TEXTURE_2D_ARRAY,0,0,0,se,X.width,X.height,1,re,xe,de)}s.clearLayerUpdates()}else t.texSubImage3D(e.TEXTURE_2D_ARRAY,0,0,0,0,X.width,X.height,X.depth,re,xe,X.data)}else t.texImage3D(e.TEXTURE_2D_ARRAY,0,ce,X.width,X.height,X.depth,0,re,xe,X.data);else if(s.isData3DTexture)Ae?(Ce&&t.texStorage3D(e.TEXTURE_3D,oe,ce,X.width,X.height,X.depth),b&&t.texSubImage3D(e.TEXTURE_3D,0,0,0,0,X.width,X.height,X.depth,re,xe,X.data)):t.texImage3D(e.TEXTURE_3D,0,ce,X.width,X.height,X.depth,0,re,xe,X.data);else if(s.isFramebufferTexture){if(Ce)if(Ae)t.texStorage2D(e.TEXTURE_2D,oe,ce,X.width,X.height);else{let z=X.width,se=X.height;for(let de=0;de<oe;de++)t.texImage2D(e.TEXTURE_2D,de,ce,z,se,0,re,xe,null),z>>=1,se>>=1}}else if(s.isHTMLTexture){if("texElementImage2D"in e){const z=e.canvas;if(z.hasAttribute("layoutsubtree")||z.setAttribute("layoutsubtree","true"),X.parentNode!==z){z.appendChild(X),g.add(s),z.onpaint=se=>{const de=se.changedElements;for(const Q of g)de.includes(Q.image)&&(Q.needsUpdate=!0)},z.requestPaint();return}if(e.texElementImage2D.length===3)e.texElementImage2D(e.TEXTURE_2D,e.RGBA8,X);else{const de=e.RGBA,Q=e.RGBA,Te=e.UNSIGNED_BYTE;e.texElementImage2D(e.TEXTURE_2D,0,de,Q,Te,X)}e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE)}}else if(Me.length>0){if(Ae&&Ce){const z=We(Me[0]);t.texStorage2D(e.TEXTURE_2D,oe,ce,z.width,z.height)}for(let z=0,se=Me.length;z<se;z++)ae=Me[z],Ae?b&&t.texSubImage2D(e.TEXTURE_2D,z,0,0,re,xe,ae):t.texImage2D(e.TEXTURE_2D,z,ce,re,xe,ae);s.generateMipmaps=!1}else if(Ae){if(Ce){const z=We(X);t.texStorage2D(e.TEXTURE_2D,oe,ce,z.width,z.height)}b&&t.texSubImage2D(e.TEXTURE_2D,0,0,0,re,xe,X)}else t.texImage2D(e.TEXTURE_2D,0,ce,re,xe,X);f(s)&&P(O),ie.__version=te.version,s.onUpdate&&s.onUpdate(s)}S.__version=s.version}function Ue(S,s,w){if(s.image.length!==6)return;const O=Ke(S,s),H=s.source;t.bindTexture(e.TEXTURE_CUBE_MAP,S.__webglTexture,e.TEXTURE0+w);const te=i.get(H);if(H.version!==te.__version||O===!0){t.activeTexture(e.TEXTURE0+w);const ie=tt.getPrimaries(tt.workingColorSpace),V=s.colorSpace===an?null:tt.getPrimaries(s.colorSpace),X=s.colorSpace===an||ie===V?e.NONE:e.BROWSER_DEFAULT_WEBGL;t.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,s.flipY),t.pixelStorei(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL,s.premultiplyAlpha),t.pixelStorei(e.UNPACK_ALIGNMENT,s.unpackAlignment),t.pixelStorei(e.UNPACK_COLORSPACE_CONVERSION_WEBGL,X);const re=s.isCompressedTexture||s.image[0].isCompressedTexture,xe=s.image[0]&&s.image[0].isDataTexture,ce=[];for(let Q=0;Q<6;Q++)!re&&!xe?ce[Q]=h(s.image[Q],!0,a.maxCubemapSize):ce[Q]=xe?s.image[Q].image:s.image[Q],ce[Q]=pt(s,ce[Q]);const ae=ce[0],Me=r.convert(s.format,s.colorSpace),Ae=r.convert(s.type),Ce=E(s.internalFormat,Me,Ae,s.normalized,s.colorSpace),b=s.isVideoTexture!==!0,oe=te.__version===void 0||O===!0,z=H.dataReady;let se=x(s,ae);Xe(e.TEXTURE_CUBE_MAP,s);let de;if(re){b&&oe&&t.texStorage2D(e.TEXTURE_CUBE_MAP,se,Ce,ae.width,ae.height);for(let Q=0;Q<6;Q++){de=ce[Q].mipmaps;for(let Te=0;Te<de.length;Te++){const ve=de[Te];s.format!==Gt?Me!==null?b?z&&t.compressedTexSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+Q,Te,0,0,ve.width,ve.height,Me,ve.data):t.compressedTexImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+Q,Te,Ce,ve.width,ve.height,0,ve.data):ze("WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()"):b?z&&t.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+Q,Te,0,0,ve.width,ve.height,Me,Ae,ve.data):t.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+Q,Te,Ce,ve.width,ve.height,0,Me,Ae,ve.data)}}}else{if(de=s.mipmaps,b&&oe){de.length>0&&se++;const Q=We(ce[0]);t.texStorage2D(e.TEXTURE_CUBE_MAP,se,Ce,Q.width,Q.height)}for(let Q=0;Q<6;Q++)if(xe){b?z&&t.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+Q,0,0,0,ce[Q].width,ce[Q].height,Me,Ae,ce[Q].data):t.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+Q,0,Ce,ce[Q].width,ce[Q].height,0,Me,Ae,ce[Q].data);for(let Te=0;Te<de.length;Te++){const $e=de[Te].image[Q].image;b?z&&t.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+Q,Te+1,0,0,$e.width,$e.height,Me,Ae,$e.data):t.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+Q,Te+1,Ce,$e.width,$e.height,0,Me,Ae,$e.data)}}else{b?z&&t.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+Q,0,0,0,Me,Ae,ce[Q]):t.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+Q,0,Ce,Me,Ae,ce[Q]);for(let Te=0;Te<de.length;Te++){const ve=de[Te];b?z&&t.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+Q,Te+1,0,0,Me,Ae,ve.image[Q]):t.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+Q,Te+1,Ce,Me,Ae,ve.image[Q])}}}f(s)&&P(e.TEXTURE_CUBE_MAP),te.__version=H.version,s.onUpdate&&s.onUpdate(s)}S.__version=s.version}function me(S,s,w,O,H,te){const ie=r.convert(w.format,w.colorSpace),V=r.convert(w.type),X=E(w.internalFormat,ie,V,w.normalized,w.colorSpace),re=i.get(s),xe=i.get(w);if(xe.__renderTarget=s,!re.__hasExternalTextures){const ce=Math.max(1,s.width>>te),ae=Math.max(1,s.height>>te);H===e.TEXTURE_3D||H===e.TEXTURE_2D_ARRAY?t.texImage3D(H,te,X,ce,ae,s.depth,0,ie,V,null):t.texImage2D(H,te,X,ce,ae,0,ie,V,null)}t.bindFramebuffer(e.FRAMEBUFFER,S),st(s)?c.framebufferTexture2DMultisampleEXT(e.FRAMEBUFFER,O,H,xe.__webglTexture,0,it(s)):(H===e.TEXTURE_2D||H>=e.TEXTURE_CUBE_MAP_POSITIVE_X&&H<=e.TEXTURE_CUBE_MAP_NEGATIVE_Z)&&e.framebufferTexture2D(e.FRAMEBUFFER,O,H,xe.__webglTexture,te),t.bindFramebuffer(e.FRAMEBUFFER,null)}function Oe(S,s,w){if(e.bindRenderbuffer(e.RENDERBUFFER,S),s.depthBuffer){const O=s.depthTexture,H=O&&O.isDepthTexture?O.type:null,te=M(s.stencilBuffer,H),ie=s.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT;st(s)?c.renderbufferStorageMultisampleEXT(e.RENDERBUFFER,it(s),te,s.width,s.height):w?e.renderbufferStorageMultisample(e.RENDERBUFFER,it(s),te,s.width,s.height):e.renderbufferStorage(e.RENDERBUFFER,te,s.width,s.height),e.framebufferRenderbuffer(e.FRAMEBUFFER,ie,e.RENDERBUFFER,S)}else{const O=s.textures;for(let H=0;H<O.length;H++){const te=O[H],ie=r.convert(te.format,te.colorSpace),V=r.convert(te.type),X=E(te.internalFormat,ie,V,te.normalized,te.colorSpace);st(s)?c.renderbufferStorageMultisampleEXT(e.RENDERBUFFER,it(s),X,s.width,s.height):w?e.renderbufferStorageMultisample(e.RENDERBUFFER,it(s),X,s.width,s.height):e.renderbufferStorage(e.RENDERBUFFER,X,s.width,s.height)}}e.bindRenderbuffer(e.RENDERBUFFER,null)}function lt(S,s,w){const O=s.isWebGLCubeRenderTarget===!0;if(t.bindFramebuffer(e.FRAMEBUFFER,S),!(s.depthTexture&&s.depthTexture.isDepthTexture))throw new Error("THREE.WebGLTextures: renderTarget.depthTexture must be an instance of THREE.DepthTexture.");const H=i.get(s.depthTexture);if(H.__renderTarget=s,(!H.__webglTexture||s.depthTexture.image.width!==s.width||s.depthTexture.image.height!==s.height)&&(s.depthTexture.image.width=s.width,s.depthTexture.image.height=s.height,s.depthTexture.needsUpdate=!0),O){if(H.__webglInit===void 0&&(H.__webglInit=!0,s.depthTexture.addEventListener("dispose",L)),H.__webglTexture===void 0){H.__webglTexture=e.createTexture(),t.bindTexture(e.TEXTURE_CUBE_MAP,H.__webglTexture),Xe(e.TEXTURE_CUBE_MAP,s.depthTexture);const re=r.convert(s.depthTexture.format),xe=r.convert(s.depthTexture.type);let ce;s.depthTexture.format===pn?ce=e.DEPTH_COMPONENT24:s.depthTexture.format===on&&(ce=e.DEPTH24_STENCIL8);for(let ae=0;ae<6;ae++)e.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+ae,0,ce,s.width,s.height,0,re,xe,null)}}else ne(s.depthTexture,0);const te=H.__webglTexture,ie=it(s),V=O?e.TEXTURE_CUBE_MAP_POSITIVE_X+w:e.TEXTURE_2D,X=s.depthTexture.format===on?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT;if(s.depthTexture.format===pn)st(s)?c.framebufferTexture2DMultisampleEXT(e.FRAMEBUFFER,X,V,te,0,ie):e.framebufferTexture2D(e.FRAMEBUFFER,X,V,te,0);else if(s.depthTexture.format===on)st(s)?c.framebufferTexture2DMultisampleEXT(e.FRAMEBUFFER,X,V,te,0,ie):e.framebufferTexture2D(e.FRAMEBUFFER,X,V,te,0);else throw new Error("THREE.WebGLTextures: Unknown depthTexture format.")}function Ie(S){const s=i.get(S),w=S.isWebGLCubeRenderTarget===!0;if(s.__boundDepthTexture!==S.depthTexture){const O=S.depthTexture;if(s.__depthDisposeCallback&&s.__depthDisposeCallback(),O){const H=()=>{delete s.__boundDepthTexture,delete s.__depthDisposeCallback,O.removeEventListener("dispose",H)};O.addEventListener("dispose",H),s.__depthDisposeCallback=H}s.__boundDepthTexture=O}if(S.depthTexture&&!s.__autoAllocateDepthBuffer)if(w)for(let O=0;O<6;O++)lt(s.__webglFramebuffer[O],S,O);else{const O=S.texture.mipmaps;O&&O.length>0?lt(s.__webglFramebuffer[0],S,0):lt(s.__webglFramebuffer,S,0)}else if(w){s.__webglDepthbuffer=[];for(let O=0;O<6;O++)if(t.bindFramebuffer(e.FRAMEBUFFER,s.__webglFramebuffer[O]),s.__webglDepthbuffer[O]===void 0)s.__webglDepthbuffer[O]=e.createRenderbuffer(),Oe(s.__webglDepthbuffer[O],S,!1);else{const H=S.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT,te=s.__webglDepthbuffer[O];e.bindRenderbuffer(e.RENDERBUFFER,te),e.framebufferRenderbuffer(e.FRAMEBUFFER,H,e.RENDERBUFFER,te)}}else{const O=S.texture.mipmaps;if(O&&O.length>0?t.bindFramebuffer(e.FRAMEBUFFER,s.__webglFramebuffer[0]):t.bindFramebuffer(e.FRAMEBUFFER,s.__webglFramebuffer),s.__webglDepthbuffer===void 0)s.__webglDepthbuffer=e.createRenderbuffer(),Oe(s.__webglDepthbuffer,S,!1);else{const H=S.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT,te=s.__webglDepthbuffer;e.bindRenderbuffer(e.RENDERBUFFER,te),e.framebufferRenderbuffer(e.FRAMEBUFFER,H,e.RENDERBUFFER,te)}}t.bindFramebuffer(e.FRAMEBUFFER,null)}function Ge(S,s,w){const O=i.get(S);s!==void 0&&me(O.__webglFramebuffer,S,S.texture,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,0),w!==void 0&&Ie(S)}function Ze(S){const s=S.texture,w=i.get(S),O=i.get(s);S.addEventListener("dispose",m);const H=S.textures,te=S.isWebGLCubeRenderTarget===!0,ie=H.length>1;if(ie||(O.__webglTexture===void 0&&(O.__webglTexture=e.createTexture()),O.__version=s.version,o.memory.textures++),te){w.__webglFramebuffer=[];for(let V=0;V<6;V++)if(s.mipmaps&&s.mipmaps.length>0){w.__webglFramebuffer[V]=[];for(let X=0;X<s.mipmaps.length;X++)w.__webglFramebuffer[V][X]=e.createFramebuffer()}else w.__webglFramebuffer[V]=e.createFramebuffer()}else{if(s.mipmaps&&s.mipmaps.length>0){w.__webglFramebuffer=[];for(let V=0;V<s.mipmaps.length;V++)w.__webglFramebuffer[V]=e.createFramebuffer()}else w.__webglFramebuffer=e.createFramebuffer();if(ie)for(let V=0,X=H.length;V<X;V++){const re=i.get(H[V]);re.__webglTexture===void 0&&(re.__webglTexture=e.createTexture(),o.memory.textures++)}if(S.samples>0&&st(S)===!1){w.__webglMultisampledFramebuffer=e.createFramebuffer(),w.__webglColorRenderbuffer=[],t.bindFramebuffer(e.FRAMEBUFFER,w.__webglMultisampledFramebuffer);for(let V=0;V<H.length;V++){const X=H[V];w.__webglColorRenderbuffer[V]=e.createRenderbuffer(),e.bindRenderbuffer(e.RENDERBUFFER,w.__webglColorRenderbuffer[V]);const re=r.convert(X.format,X.colorSpace),xe=r.convert(X.type),ce=E(X.internalFormat,re,xe,X.normalized,X.colorSpace,S.isXRRenderTarget===!0),ae=it(S);e.renderbufferStorageMultisample(e.RENDERBUFFER,ae,ce,S.width,S.height),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0+V,e.RENDERBUFFER,w.__webglColorRenderbuffer[V])}e.bindRenderbuffer(e.RENDERBUFFER,null),S.depthBuffer&&(w.__webglDepthRenderbuffer=e.createRenderbuffer(),Oe(w.__webglDepthRenderbuffer,S,!0)),t.bindFramebuffer(e.FRAMEBUFFER,null)}}if(te){t.bindTexture(e.TEXTURE_CUBE_MAP,O.__webglTexture),Xe(e.TEXTURE_CUBE_MAP,s);for(let V=0;V<6;V++)if(s.mipmaps&&s.mipmaps.length>0)for(let X=0;X<s.mipmaps.length;X++)me(w.__webglFramebuffer[V][X],S,s,e.COLOR_ATTACHMENT0,e.TEXTURE_CUBE_MAP_POSITIVE_X+V,X);else me(w.__webglFramebuffer[V],S,s,e.COLOR_ATTACHMENT0,e.TEXTURE_CUBE_MAP_POSITIVE_X+V,0);f(s)&&P(e.TEXTURE_CUBE_MAP),t.unbindTexture()}else if(ie){for(let V=0,X=H.length;V<X;V++){const re=H[V],xe=i.get(re);let ce=e.TEXTURE_2D;(S.isWebGL3DRenderTarget||S.isWebGLArrayRenderTarget)&&(ce=S.isWebGL3DRenderTarget?e.TEXTURE_3D:e.TEXTURE_2D_ARRAY),t.bindTexture(ce,xe.__webglTexture),Xe(ce,re),me(w.__webglFramebuffer,S,re,e.COLOR_ATTACHMENT0+V,ce,0),f(re)&&P(ce)}t.unbindTexture()}else{let V=e.TEXTURE_2D;if((S.isWebGL3DRenderTarget||S.isWebGLArrayRenderTarget)&&(V=S.isWebGL3DRenderTarget?e.TEXTURE_3D:e.TEXTURE_2D_ARRAY),t.bindTexture(V,O.__webglTexture),Xe(V,s),s.mipmaps&&s.mipmaps.length>0)for(let X=0;X<s.mipmaps.length;X++)me(w.__webglFramebuffer[X],S,s,e.COLOR_ATTACHMENT0,V,X);else me(w.__webglFramebuffer,S,s,e.COLOR_ATTACHMENT0,V,0);f(s)&&P(V),t.unbindTexture()}S.depthBuffer&&Ie(S)}function ye(S){const s=S.textures;for(let w=0,O=s.length;w<O;w++){const H=s[w];if(f(H)){const te=F(S),ie=i.get(H).__webglTexture;t.bindTexture(te,ie),P(te),t.unbindTexture()}}}const nt=[],dt=[];function vt(S){if(S.samples>0){if(st(S)===!1){const s=S.textures,w=S.width,O=S.height;let H=e.COLOR_BUFFER_BIT;const te=S.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT,ie=i.get(S),V=s.length>1;if(V)for(let re=0;re<s.length;re++)t.bindFramebuffer(e.FRAMEBUFFER,ie.__webglMultisampledFramebuffer),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0+re,e.RENDERBUFFER,null),t.bindFramebuffer(e.FRAMEBUFFER,ie.__webglFramebuffer),e.framebufferTexture2D(e.DRAW_FRAMEBUFFER,e.COLOR_ATTACHMENT0+re,e.TEXTURE_2D,null,0);t.bindFramebuffer(e.READ_FRAMEBUFFER,ie.__webglMultisampledFramebuffer);const X=S.texture.mipmaps;X&&X.length>0?t.bindFramebuffer(e.DRAW_FRAMEBUFFER,ie.__webglFramebuffer[0]):t.bindFramebuffer(e.DRAW_FRAMEBUFFER,ie.__webglFramebuffer);for(let re=0;re<s.length;re++){if(S.resolveDepthBuffer&&(S.depthBuffer&&(H|=e.DEPTH_BUFFER_BIT),S.stencilBuffer&&S.resolveStencilBuffer&&(H|=e.STENCIL_BUFFER_BIT)),V){e.framebufferRenderbuffer(e.READ_FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.RENDERBUFFER,ie.__webglColorRenderbuffer[re]);const xe=i.get(s[re]).__webglTexture;e.framebufferTexture2D(e.DRAW_FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,xe,0)}e.blitFramebuffer(0,0,w,O,0,0,w,O,H,e.NEAREST),l===!0&&(nt.length=0,dt.length=0,nt.push(e.COLOR_ATTACHMENT0+re),S.depthBuffer&&S.storeMultisampledDepthBuffer===!1&&(nt.push(te),dt.push(te),e.invalidateFramebuffer(e.DRAW_FRAMEBUFFER,dt)),e.invalidateFramebuffer(e.READ_FRAMEBUFFER,nt))}if(t.bindFramebuffer(e.READ_FRAMEBUFFER,null),t.bindFramebuffer(e.DRAW_FRAMEBUFFER,null),V)for(let re=0;re<s.length;re++){t.bindFramebuffer(e.FRAMEBUFFER,ie.__webglMultisampledFramebuffer),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0+re,e.RENDERBUFFER,ie.__webglColorRenderbuffer[re]);const xe=i.get(s[re]).__webglTexture;t.bindFramebuffer(e.FRAMEBUFFER,ie.__webglFramebuffer),e.framebufferTexture2D(e.DRAW_FRAMEBUFFER,e.COLOR_ATTACHMENT0+re,e.TEXTURE_2D,xe,0)}t.bindFramebuffer(e.DRAW_FRAMEBUFFER,ie.__webglMultisampledFramebuffer)}else if(S.depthBuffer&&S.storeMultisampledDepthBuffer===!1&&l){const s=S.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT;e.invalidateFramebuffer(e.DRAW_FRAMEBUFFER,[s])}}}function it(S){return Math.min(a.maxSamples,S.samples)}function st(S){const s=i.get(S);return S.samples>0&&n.has("WEBGL_multisampled_render_to_texture")===!0&&s.__useRenderToTexture!==!1}function C(S){const s=o.render.frame;_.get(S)!==s&&(_.set(S,s),S.update())}function pt(S,s){const w=S.colorSpace,O=S.format,H=S.type;return S.isCompressedTexture===!0||S.isVideoTexture===!0||w!==bt&&w!==an&&(tt.getTransfer(w)===Qe?(O!==Gt||H!==Dt)&&ze("WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType."):et("WebGLTextures: Unsupported texture color space:",w)),s}function We(S){return typeof HTMLImageElement<"u"&&S instanceof HTMLImageElement?(d.width=S.naturalWidth||S.width,d.height=S.naturalHeight||S.height):typeof VideoFrame<"u"&&S instanceof VideoFrame?(d.width=S.displayWidth,d.height=S.displayHeight):(d.width=S.width,d.height=S.height),d}this.allocateTextureUnit=j,this.resetTextureUnits=q,this.getTextureUnits=N,this.setTextureUnits=K,this.setTexture2D=ne,this.setTexture2DArray=Z,this.setTexture3D=J,this.setTextureCube=ee,this.rebindTextures=Ge,this.setupRenderTarget=Ze,this.updateRenderTargetMipmap=ye,this.updateMultisampleRenderTarget=vt,this.setupDepthRenderbuffer=Ie,this.setupFrameBufferTexture=me,this.useMultisampledRTT=st,this.isReversedDepthBuffer=function(){return t.buffers.depth.getReversed()}}function gd(e,n){function t(i,a=an){let r;const o=tt.getTransfer(a);if(i===Dt)return e.UNSIGNED_BYTE;if(i===ia)return e.UNSIGNED_SHORT_4_4_4_4;if(i===ra)return e.UNSIGNED_SHORT_5_5_5_1;if(i===Ho)return e.UNSIGNED_INT_5_9_9_9_REV;if(i===Vo)return e.UNSIGNED_INT_10F_11F_11F_REV;if(i===ko)return e.BYTE;if(i===Wo)return e.SHORT;if(i===Bn)return e.UNSIGNED_SHORT;if(i===la)return e.INT;if(i===Jt)return e.UNSIGNED_INT;if(i===qt)return e.FLOAT;if(i===Vt)return e.HALF_FLOAT;if(i===zo)return e.ALPHA;if(i===Xo)return e.RGB;if(i===Gt)return e.RGBA;if(i===pn)return e.DEPTH_COMPONENT;if(i===on)return e.DEPTH_STENCIL;if(i===Ko)return e.RED;if(i===na)return e.RED_INTEGER;if(i===dn)return e.RG;if(i===ta)return e.RG_INTEGER;if(i===ea)return e.RGBA_INTEGER;if(i===Xn||i===Kn||i===Yn||i===qn)if(o===Qe)if(r=n.get("WEBGL_compressed_texture_s3tc_srgb"),r!==null){if(i===Xn)return r.COMPRESSED_SRGB_S3TC_DXT1_EXT;if(i===Kn)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;if(i===Yn)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT;if(i===qn)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT}else return null;else if(r=n.get("WEBGL_compressed_texture_s3tc"),r!==null){if(i===Xn)return r.COMPRESSED_RGB_S3TC_DXT1_EXT;if(i===Kn)return r.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(i===Yn)return r.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(i===qn)return r.COMPRESSED_RGBA_S3TC_DXT5_EXT}else return null;if(i===Hi||i===Vi||i===ki||i===Wi)if(r=n.get("WEBGL_compressed_texture_pvrtc"),r!==null){if(i===Hi)return r.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(i===Vi)return r.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(i===ki)return r.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(i===Wi)return r.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}else return null;if(i===zi||i===Xi||i===Ki||i===Yi||i===qi||i===li||i===Zi)if(r=n.get("WEBGL_compressed_texture_etc"),r!==null){if(i===zi||i===Xi)return o===Qe?r.COMPRESSED_SRGB8_ETC2:r.COMPRESSED_RGB8_ETC2;if(i===Ki)return o===Qe?r.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC:r.COMPRESSED_RGBA8_ETC2_EAC;if(i===Yi)return r.COMPRESSED_R11_EAC;if(i===qi)return r.COMPRESSED_SIGNED_R11_EAC;if(i===li)return r.COMPRESSED_RG11_EAC;if(i===Zi)return r.COMPRESSED_SIGNED_RG11_EAC}else return null;if(i===$i||i===ji||i===Qi||i===Ji||i===er||i===tr||i===nr||i===ir||i===rr||i===ar||i===or||i===sr||i===cr||i===lr)if(r=n.get("WEBGL_compressed_texture_astc"),r!==null){if(i===$i)return o===Qe?r.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR:r.COMPRESSED_RGBA_ASTC_4x4_KHR;if(i===ji)return o===Qe?r.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR:r.COMPRESSED_RGBA_ASTC_5x4_KHR;if(i===Qi)return o===Qe?r.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR:r.COMPRESSED_RGBA_ASTC_5x5_KHR;if(i===Ji)return o===Qe?r.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR:r.COMPRESSED_RGBA_ASTC_6x5_KHR;if(i===er)return o===Qe?r.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR:r.COMPRESSED_RGBA_ASTC_6x6_KHR;if(i===tr)return o===Qe?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR:r.COMPRESSED_RGBA_ASTC_8x5_KHR;if(i===nr)return o===Qe?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR:r.COMPRESSED_RGBA_ASTC_8x6_KHR;if(i===ir)return o===Qe?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR:r.COMPRESSED_RGBA_ASTC_8x8_KHR;if(i===rr)return o===Qe?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR:r.COMPRESSED_RGBA_ASTC_10x5_KHR;if(i===ar)return o===Qe?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR:r.COMPRESSED_RGBA_ASTC_10x6_KHR;if(i===or)return o===Qe?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR:r.COMPRESSED_RGBA_ASTC_10x8_KHR;if(i===sr)return o===Qe?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR:r.COMPRESSED_RGBA_ASTC_10x10_KHR;if(i===cr)return o===Qe?r.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR:r.COMPRESSED_RGBA_ASTC_12x10_KHR;if(i===lr)return o===Qe?r.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR:r.COMPRESSED_RGBA_ASTC_12x12_KHR}else return null;if(i===fr||i===ur||i===dr)if(r=n.get("EXT_texture_compression_bptc"),r!==null){if(i===fr)return o===Qe?r.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT:r.COMPRESSED_RGBA_BPTC_UNORM_EXT;if(i===ur)return r.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT;if(i===dr)return r.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT}else return null;if(i===pr||i===hr||i===fi||i===mr)if(r=n.get("EXT_texture_compression_rgtc"),r!==null){if(i===pr)return r.COMPRESSED_RED_RGTC1_EXT;if(i===hr)return r.COMPRESSED_SIGNED_RED_RGTC1_EXT;if(i===fi)return r.COMPRESSED_RED_GREEN_RGTC2_EXT;if(i===mr)return r.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT}else return null;return i===Rn?e.UNSIGNED_INT_24_8:e[i]!==void 0?e[i]:null}return{convert:t}}const vd=`
void main() {

	gl_Position = vec4( position, 1.0 );

}`,Sd=`
uniform sampler2DArray depthColor;
uniform float depthWidth;
uniform float depthHeight;

void main() {

	vec2 coord = vec2( gl_FragCoord.x / depthWidth, gl_FragCoord.y / depthHeight );

	if ( coord.x >= 1.0 ) {

		gl_FragDepth = texture( depthColor, vec3( coord.x - 1.0, coord.y, 1 ) ).r;

	} else {

		gl_FragDepth = texture( depthColor, vec3( coord.x, coord.y, 0 ) ).r;

	}

}`;class Ed{constructor(){this.texture=null,this.mesh=null,this.depthNear=0,this.depthFar=0}init(n,t){if(this.texture===null){const i=new ca(n.texture);(n.depthNear!==t.depthNear||n.depthFar!==t.depthFar)&&(this.depthNear=n.depthNear,this.depthFar=n.depthFar),this.texture=i}}getMesh(n){if(this.texture!==null&&this.mesh===null){const t=n.cameras[0].viewport,i=new kt({vertexShader:vd,fragmentShader:Sd,uniforms:{depthColor:{value:this.texture},depthWidth:{value:t.z},depthHeight:{value:t.w}}});this.mesh=new Ot(new aa(20,20),i)}return this.mesh}reset(){this.texture=null,this.mesh=null}getDepthTexture(){return this.texture}}class xd extends Mo{constructor(n,t){super();const i=this;let a=null,r=1,o=null,c="local-floor",l=1,d=null,_=null,g=null,p=null,v=null,A=null;const U=typeof XRWebGLBinding<"u",h=new Ed,f={},P=t.getContextAttributes();let F=null,E=null;const M=[],x=[],L=new _t;let m=null,T=null;const y=new Tn;y.viewport=new Et;const G=new Tn;G.viewport=new Et;const k=[y,G],q=new To;let N=null,K=null;this.cameraAutoUpdate=!0,this.enabled=!1,this.isPresenting=!1,this.getController=function(W){let $=M[W];return $===void 0&&($=new zn,M[W]=$),$.getTargetRaySpace()},this.getControllerGrip=function(W){let $=M[W];return $===void 0&&($=new zn,M[W]=$),$.getGripSpace()},this.getHand=function(W){let $=M[W];return $===void 0&&($=new zn,M[W]=$),$.getHandSpace()};function j(W){const $=x.indexOf(W.inputSource);if($===-1)return;const Ee=M[$];Ee!==void 0&&(Ee.update(W.inputSource,W.frame,d||o),Ee.dispatchEvent({type:W.type,data:W.inputSource}))}function Y(){a.removeEventListener("select",j),a.removeEventListener("selectstart",j),a.removeEventListener("selectend",j),a.removeEventListener("squeeze",j),a.removeEventListener("squeezestart",j),a.removeEventListener("squeezeend",j),a.removeEventListener("end",Y),a.removeEventListener("inputsourceschange",ne);for(let W=0;W<M.length;W++){const $=x[W];$!==null&&(x[W]=null,M[W].disconnect($))}N=null,K=null,h.reset();for(const W in f)delete f[W];if(n.setRenderTarget(F),v=null,p=null,g=null,a=null,E=null,Ke.stop(),i.isPresenting=!1,n.setPixelRatio(m),n.setSize(L.width,L.height,!1),T!==null){const W=T.camera;W.fov=T.fov,W.zoom=T.zoom,W.updateProjectionMatrix(),T=null}i.dispatchEvent({type:"sessionend"})}this.setFramebufferScaleFactor=function(W){r=W,i.isPresenting===!0&&ze("WebXRManager: Cannot change framebuffer scale while presenting.")},this.setReferenceSpaceType=function(W){c=W,i.isPresenting===!0&&ze("WebXRManager: Cannot change reference space type while presenting.")},this.getReferenceSpace=function(){return d||o},this.setReferenceSpace=function(W){d=W},this.getBaseLayer=function(){return p!==null?p:v},this.getBinding=function(){return g===null&&U&&(g=new XRWebGLBinding(a,t)),g},this.getFrame=function(){return A},this.getSession=function(){return a},this.setSession=async function(W){if(a=W,a!==null){if(F=n.getRenderTarget(),a.addEventListener("select",j),a.addEventListener("selectstart",j),a.addEventListener("selectend",j),a.addEventListener("squeeze",j),a.addEventListener("squeezestart",j),a.addEventListener("squeezeend",j),a.addEventListener("end",Y),a.addEventListener("inputsourceschange",ne),P.xrCompatible!==!0&&await t.makeXRCompatible(),m=n.getPixelRatio(),n.getSize(L),U&&"createProjectionLayer"in XRWebGLBinding.prototype){let Ee=null,Ue=null,me=null;P.depth&&(me=P.stencil?t.DEPTH24_STENCIL8:t.DEPTH_COMPONENT24,Ee=P.stencil?on:pn,Ue=P.stencil?Rn:Jt);const Oe={colorFormat:t.RGBA8,depthFormat:me,scaleFactor:r};g=this.getBinding(),p=g.createProjectionLayer(Oe),a.updateRenderState({layers:[p]}),n.setPixelRatio(1),n.setSize(p.textureWidth,p.textureHeight,!1),E=new Rt(p.textureWidth,p.textureHeight,{format:Gt,type:Dt,depthTexture:new Fn(p.textureWidth,p.textureHeight,Ue,void 0,void 0,void 0,void 0,void 0,void 0,Ee),stencilBuffer:P.stencil,colorSpace:n.outputColorSpace,samples:P.antialias?4:0,resolveDepthBuffer:p.ignoreDepthValues===!1,resolveStencilBuffer:p.ignoreDepthValues===!1,storeMultisampledDepthBuffer:p.ignoreDepthValues===!1,storeMultisampledStencilBuffer:p.ignoreDepthValues===!1})}else{const Ee={antialias:P.antialias,alpha:!0,depth:P.depth,stencil:P.stencil,framebufferScaleFactor:r};v=new XRWebGLLayer(a,t,Ee),a.updateRenderState({baseLayer:v}),n.setPixelRatio(1),n.setSize(v.framebufferWidth,v.framebufferHeight,!1),E=new Rt(v.framebufferWidth,v.framebufferHeight,{format:Gt,type:Dt,colorSpace:n.outputColorSpace,stencilBuffer:P.stencil,resolveDepthBuffer:v.ignoreDepthValues===!1,resolveStencilBuffer:v.ignoreDepthValues===!1,storeMultisampledDepthBuffer:v.ignoreDepthValues===!1,storeMultisampledStencilBuffer:v.ignoreDepthValues===!1})}E.isXRRenderTarget=!0,this.setFoveation(l),d=null,o=await a.requestReferenceSpace(c),Ke.setContext(a),Ke.start(),i.isPresenting=!0,i.dispatchEvent({type:"sessionstart"})}},this.getEnvironmentBlendMode=function(){if(a!==null)return a.environmentBlendMode},this.getDepthTexture=function(){return h.getDepthTexture()};function ne(W){for(let $=0;$<W.removed.length;$++){const Ee=W.removed[$],Ue=x.indexOf(Ee);Ue>=0&&(x[Ue]=null,M[Ue].disconnect(Ee))}for(let $=0;$<W.added.length;$++){const Ee=W.added[$];let Ue=x.indexOf(Ee);if(Ue===-1){for(let Oe=0;Oe<M.length;Oe++)if(Oe>=x.length){x.push(Ee),Ue=Oe;break}else if(x[Oe]===null){x[Oe]=Ee,Ue=Oe;break}if(Ue===-1)break}const me=M[Ue];me&&me.connect(Ee)}}const Z=new Le,J=new Le;function ee(W,$,Ee){Z.setFromMatrixPosition($.matrixWorld),J.setFromMatrixPosition(Ee.matrixWorld);const Ue=Z.distanceTo(J),me=$.projectionMatrix.elements,Oe=Ee.projectionMatrix.elements,lt=me[14]/(me[10]-1),Ie=me[14]/(me[10]+1),Ge=(me[9]+1)/me[5],Ze=(me[9]-1)/me[5],ye=(me[8]-1)/me[0],nt=(Oe[8]+1)/Oe[0],dt=lt*ye,vt=lt*nt,it=Ue/(-ye+nt),st=it*-ye;if($.matrixWorld.decompose(W.position,W.quaternion,W.scale),W.translateX(st),W.translateZ(it),W.matrixWorld.compose(W.position,W.quaternion,W.scale),W.matrixWorldInverse.copy(W.matrixWorld).invert(),me[10]===-1)W.projectionMatrix.copy($.projectionMatrix),W.projectionMatrixInverse.copy($.projectionMatrixInverse);else{const C=lt+it,pt=Ie+it,We=dt-st,S=vt+(Ue-st),s=Ge*Ie/pt*C,w=Ze*Ie/pt*C;W.projectionMatrix.makePerspective(We,S,s,w,C,pt),W.projectionMatrixInverse.copy(W.projectionMatrix).invert()}}function be(W,$){$===null?W.matrixWorld.copy(W.matrix):W.matrixWorld.multiplyMatrices($.matrixWorld,W.matrix),W.matrixWorldInverse.copy(W.matrixWorld).invert()}this.updateCamera=function(W){if(a===null)return;let $=W.near,Ee=W.far;h.texture!==null&&(h.depthNear>0&&($=h.depthNear),h.depthFar>0&&(Ee=h.depthFar)),q.near=G.near=y.near=$,q.far=G.far=y.far=Ee,(N!==q.near||K!==q.far)&&(a.updateRenderState({depthNear:q.near,depthFar:q.far}),N=q.near,K=q.far),q.layers.mask=W.layers.mask|6,y.layers.mask=q.layers.mask&-5,G.layers.mask=q.layers.mask&-3;const Ue=W.parent,me=q.cameras;be(q,Ue);for(let Oe=0;Oe<me.length;Oe++)be(me[Oe],Ue);me.length===2?ee(q,y,G):q.projectionMatrix.copy(y.projectionMatrix),T===null&&W.isPerspectiveCamera&&(T={camera:W,fov:W.fov,zoom:W.zoom}),Re(W,q,Ue)};function Re(W,$,Ee){Ee===null?W.matrix.copy($.matrixWorld):(W.matrix.copy(Ee.matrixWorld),W.matrix.invert(),W.matrix.multiply($.matrixWorld)),W.matrix.decompose(W.position,W.quaternion,W.scale),W.updateMatrixWorld(!0),W.projectionMatrix.copy($.projectionMatrix),W.projectionMatrixInverse.copy($.projectionMatrixInverse),W.isPerspectiveCamera&&(W.fov=Ao*2*Math.atan(1/W.projectionMatrix.elements[5]),W.zoom=1)}this.getCamera=function(){return q},this.getFoveation=function(){if(!(p===null&&v===null))return l},this.setFoveation=function(W){l=W,p!==null&&(p.fixedFoveation=W),v!==null&&v.fixedFoveation!==void 0&&(v.fixedFoveation=W)},this.hasDepthSensing=function(){return h.texture!==null},this.getDepthSensingMesh=function(){return h.getMesh(q)},this.getCameraTexture=function(W){return f[W]};let rt=null;function Xe(W,$){if(_=$.getViewerPose(d||o),A=$,_!==null){const Ee=_.views;v!==null&&(n.setRenderTargetFramebuffer(E,v.framebuffer),n.setRenderTarget(E));let Ue=!1;Ee.length!==q.cameras.length&&(q.cameras.length=0,Ue=!0);for(let Ie=0;Ie<Ee.length;Ie++){const Ge=Ee[Ie];let Ze=null;if(v!==null)Ze=v.getViewport(Ge);else{const nt=g.getViewSubImage(p,Ge);Ze=nt.viewport,Ie===0&&(n.setRenderTargetTextures(E,nt.colorTexture,nt.depthStencilTexture),n.setRenderTarget(E))}let ye=k[Ie];ye===void 0&&(ye=new Tn,ye.layers.enable(Ie),ye.viewport=new Et,k[Ie]=ye),ye.matrix.fromArray(Ge.transform.matrix),ye.matrix.decompose(ye.position,ye.quaternion,ye.scale),ye.projectionMatrix.fromArray(Ge.projectionMatrix),ye.projectionMatrixInverse.copy(ye.projectionMatrix).invert(),ye.viewport.set(Ze.x,Ze.y,Ze.width,Ze.height),Ie===0&&(q.matrix.copy(ye.matrix),q.matrix.decompose(q.position,q.quaternion,q.scale)),Ue===!0&&q.cameras.push(ye)}const me=a.enabledFeatures;if(me&&me.includes("depth-sensing")&&a.depthUsage=="gpu-optimized"&&U){g=i.getBinding();const Ie=g.getDepthInformation(Ee[0]);Ie&&Ie.isValid&&Ie.texture&&h.init(Ie,a.renderState)}if(me&&me.includes("camera-access")&&U){n.state.unbindTexture(),g=i.getBinding();for(let Ie=0;Ie<Ee.length;Ie++){const Ge=Ee[Ie].camera;if(Ge){let Ze=f[Ge];Ze||(Ze=new ca,f[Ge]=Ze);const ye=g.getCameraImage(Ge);Ze.sourceTexture=ye}}}}for(let Ee=0;Ee<M.length;Ee++){const Ue=x[Ee],me=M[Ee];Ue!==null&&me!==void 0&&me.update(Ue,$,d||o)}rt&&rt(W,$),$.detectedPlanes&&i.dispatchEvent({type:"planesdetected",data:$}),A=null}const Ke=new Ra;Ke.setAnimationLoop(Xe),this.setAnimationLoop=function(W){rt=W},this.dispose=function(){}}}const Md=new yt,Da=new Fe;Da.set(-1,0,0,0,1,0,0,0,1);function Td(e,n){function t(h,f){h.matrixAutoUpdate===!0&&h.updateMatrix(),f.value.copy(h.matrix)}function i(h,f){f.color.getRGB(h.fogColor.value,oa(e)),f.isFog?(h.fogNear.value=f.near,h.fogFar.value=f.far):f.isFogExp2&&(h.fogDensity.value=f.density)}function a(h,f,P,F,E){f.isNodeMaterial?f.uniformsNeedUpdate=!1:f.isMeshBasicMaterial?r(h,f):f.isMeshLambertMaterial?(r(h,f),f.envMap&&(h.envMapIntensity.value=f.envMapIntensity)):f.isMeshToonMaterial?(r(h,f),g(h,f)):f.isMeshPhongMaterial?(r(h,f),_(h,f),f.envMap&&(h.envMapIntensity.value=f.envMapIntensity)):f.isMeshStandardMaterial?(r(h,f),p(h,f),f.isMeshPhysicalMaterial&&v(h,f,E)):f.isMeshMatcapMaterial?(r(h,f),A(h,f)):f.isMeshDepthMaterial?r(h,f):f.isMeshDistanceMaterial?(r(h,f),U(h,f)):f.isMeshNormalMaterial?r(h,f):f.isLineBasicMaterial?(o(h,f),f.isLineDashedMaterial&&c(h,f)):f.isPointsMaterial?l(h,f,P,F):f.isSpriteMaterial?d(h,f):f.isShadowMaterial?(h.color.value.copy(f.color),h.opacity.value=f.opacity):f.isShaderMaterial&&(f.uniformsNeedUpdate=!1)}function r(h,f){h.opacity.value=f.opacity,f.color&&h.diffuse.value.copy(f.color),f.emissive&&h.emissive.value.copy(f.emissive).multiplyScalar(f.emissiveIntensity),f.map&&(h.map.value=f.map,t(f.map,h.mapTransform)),f.alphaMap&&(h.alphaMap.value=f.alphaMap,t(f.alphaMap,h.alphaMapTransform)),f.bumpMap&&(h.bumpMap.value=f.bumpMap,t(f.bumpMap,h.bumpMapTransform),h.bumpScale.value=f.bumpScale,f.side===xt&&(h.bumpScale.value*=-1)),f.normalMap&&(h.normalMap.value=f.normalMap,t(f.normalMap,h.normalMapTransform),h.normalScale.value.copy(f.normalScale),f.side===xt&&h.normalScale.value.negate()),f.displacementMap&&(h.displacementMap.value=f.displacementMap,t(f.displacementMap,h.displacementMapTransform),h.displacementScale.value=f.displacementScale,h.displacementBias.value=f.displacementBias),f.emissiveMap&&(h.emissiveMap.value=f.emissiveMap,t(f.emissiveMap,h.emissiveMapTransform)),f.specularMap&&(h.specularMap.value=f.specularMap,t(f.specularMap,h.specularMapTransform)),f.alphaTest>0&&(h.alphaTest.value=f.alphaTest);const P=n.get(f),F=P.envMap,E=P.envMapRotation;F&&(h.envMap.value=F,h.envMapRotation.value.setFromMatrix4(Md.makeRotationFromEuler(E)).transpose(),F.isCubeTexture&&F.isRenderTargetTexture===!1&&h.envMapRotation.value.premultiply(Da),h.reflectivity.value=f.reflectivity,h.ior.value=f.ior,h.refractionRatio.value=f.refractionRatio),f.lightMap&&(h.lightMap.value=f.lightMap,h.lightMapIntensity.value=f.lightMapIntensity,t(f.lightMap,h.lightMapTransform)),f.aoMap&&(h.aoMap.value=f.aoMap,h.aoMapIntensity.value=f.aoMapIntensity,t(f.aoMap,h.aoMapTransform))}function o(h,f){h.diffuse.value.copy(f.color),h.opacity.value=f.opacity,f.map&&(h.map.value=f.map,t(f.map,h.mapTransform))}function c(h,f){h.dashSize.value=f.dashSize,h.totalSize.value=f.dashSize+f.gapSize,h.scale.value=f.scale}function l(h,f,P,F){h.diffuse.value.copy(f.color),h.opacity.value=f.opacity,h.size.value=f.size*P,h.scale.value=F*.5,f.map&&(h.map.value=f.map,t(f.map,h.uvTransform)),f.alphaMap&&(h.alphaMap.value=f.alphaMap,t(f.alphaMap,h.alphaMapTransform)),f.alphaTest>0&&(h.alphaTest.value=f.alphaTest)}function d(h,f){h.diffuse.value.copy(f.color),h.opacity.value=f.opacity,h.rotation.value=f.rotation,f.map&&(h.map.value=f.map,t(f.map,h.mapTransform)),f.alphaMap&&(h.alphaMap.value=f.alphaMap,t(f.alphaMap,h.alphaMapTransform)),f.alphaTest>0&&(h.alphaTest.value=f.alphaTest)}function _(h,f){h.specular.value.copy(f.specular),h.shininess.value=Math.max(f.shininess,1e-4)}function g(h,f){f.gradientMap&&(h.gradientMap.value=f.gradientMap)}function p(h,f){h.metalness.value=f.metalness,f.metalnessMap&&(h.metalnessMap.value=f.metalnessMap,t(f.metalnessMap,h.metalnessMapTransform)),h.roughness.value=f.roughness,f.roughnessMap&&(h.roughnessMap.value=f.roughnessMap,t(f.roughnessMap,h.roughnessMapTransform)),f.envMap&&(h.envMapIntensity.value=f.envMapIntensity)}function v(h,f,P){h.ior.value=f.ior,f.sheen>0&&(h.sheenColor.value.copy(f.sheenColor).multiplyScalar(f.sheen),h.sheenRoughness.value=f.sheenRoughness,f.sheenColorMap&&(h.sheenColorMap.value=f.sheenColorMap,t(f.sheenColorMap,h.sheenColorMapTransform)),f.sheenRoughnessMap&&(h.sheenRoughnessMap.value=f.sheenRoughnessMap,t(f.sheenRoughnessMap,h.sheenRoughnessMapTransform))),f.clearcoat>0&&(h.clearcoat.value=f.clearcoat,h.clearcoatRoughness.value=f.clearcoatRoughness,f.clearcoatMap&&(h.clearcoatMap.value=f.clearcoatMap,t(f.clearcoatMap,h.clearcoatMapTransform)),f.clearcoatRoughnessMap&&(h.clearcoatRoughnessMap.value=f.clearcoatRoughnessMap,t(f.clearcoatRoughnessMap,h.clearcoatRoughnessMapTransform)),f.clearcoatNormalMap&&(h.clearcoatNormalMap.value=f.clearcoatNormalMap,t(f.clearcoatNormalMap,h.clearcoatNormalMapTransform),h.clearcoatNormalScale.value.copy(f.clearcoatNormalScale),f.side===xt&&h.clearcoatNormalScale.value.negate())),f.dispersion>0&&(h.dispersion.value=f.dispersion),f.retroreflectivity>0&&(h.retroreflectivity.value=f.retroreflectivity),f.iridescence>0&&(h.iridescence.value=f.iridescence,h.iridescenceIOR.value=f.iridescenceIOR,h.iridescenceThicknessMinimum.value=f.iridescenceThicknessRange[0],h.iridescenceThicknessMaximum.value=f.iridescenceThicknessRange[1],f.iridescenceMap&&(h.iridescenceMap.value=f.iridescenceMap,t(f.iridescenceMap,h.iridescenceMapTransform)),f.iridescenceThicknessMap&&(h.iridescenceThicknessMap.value=f.iridescenceThicknessMap,t(f.iridescenceThicknessMap,h.iridescenceThicknessMapTransform))),f.transmission>0&&(h.transmission.value=f.transmission,h.transmissionSamplerMap.value=P.texture,h.transmissionSamplerSize.value.set(P.width,P.height),f.transmissionMap&&(h.transmissionMap.value=f.transmissionMap,t(f.transmissionMap,h.transmissionMapTransform)),h.thickness.value=f.thickness,f.thicknessMap&&(h.thicknessMap.value=f.thicknessMap,t(f.thicknessMap,h.thicknessMapTransform)),h.attenuationDistance.value=f.attenuationDistance,h.attenuationColor.value.copy(f.attenuationColor)),f.anisotropy>0&&(h.anisotropyVector.value.set(f.anisotropy*Math.cos(f.anisotropyRotation),f.anisotropy*Math.sin(f.anisotropyRotation)),f.anisotropyMap&&(h.anisotropyMap.value=f.anisotropyMap,t(f.anisotropyMap,h.anisotropyMapTransform))),h.specularIntensity.value=f.specularIntensity,h.specularColor.value.copy(f.specularColor),f.specularColorMap&&(h.specularColorMap.value=f.specularColorMap,t(f.specularColorMap,h.specularColorMapTransform)),f.specularIntensityMap&&(h.specularIntensityMap.value=f.specularIntensityMap,t(f.specularIntensityMap,h.specularIntensityMapTransform))}function A(h,f){f.matcap&&(h.matcap.value=f.matcap)}function U(h,f){const P=n.get(f).light;h.referencePosition.value.setFromMatrixPosition(P.matrixWorld),h.nearDistance.value=P.shadow.camera.near,h.farDistance.value=P.shadow.camera.far}return{refreshFogUniforms:i,refreshMaterialUniforms:a}}function Ad(e,n,t,i){let a={},r={},o=[];const c=e.getParameter(e.MAX_UNIFORM_BUFFER_BINDINGS);function l(E,M){const x=M.program;i.uniformBlockBinding(E,x)}function d(E,M){let x=a[E.id];x===void 0&&(h(E),x=_(E),a[E.id]=x,E.addEventListener("dispose",P));const L=M.program;i.updateUBOMapping(E,L);const m=n.render.frame;r[E.id]!==m&&(p(E),r[E.id]=m)}function _(E){const M=g();E.__bindingPointIndex=M;const x=e.createBuffer(),L=E.__size,m=E.usage;return e.bindBuffer(e.UNIFORM_BUFFER,x),e.bufferData(e.UNIFORM_BUFFER,L,m),e.bindBuffer(e.UNIFORM_BUFFER,null),e.bindBufferBase(e.UNIFORM_BUFFER,M,x),x}function g(){for(let E=0;E<c;E++)if(o.indexOf(E)===-1)return o.push(E),E;return et("WebGLRenderer: Maximum number of simultaneously usable uniforms groups reached."),0}function p(E){const M=a[E.id],x=E.uniforms,L=E.__cache;e.bindBuffer(e.UNIFORM_BUFFER,M);for(let m=0,T=x.length;m<T;m++){const y=x[m];if(Array.isArray(y))for(let G=0,k=y.length;G<k;G++)v(y[G],m,G,L);else v(y,m,0,L)}e.bindBuffer(e.UNIFORM_BUFFER,null)}function v(E,M,x,L){if(U(E,M,x,L)===!0){const m=E.__offset,T=E.value;if(Array.isArray(T)){let y=0;for(let G=0;G<T.length;G++){const k=T[G],q=f(k);A(k,E.__data,y),typeof k!="number"&&typeof k!="boolean"&&!k.isMatrix3&&!ArrayBuffer.isView(k)&&(y+=q.storage/Float32Array.BYTES_PER_ELEMENT)}}else A(T,E.__data,0);e.bufferSubData(e.UNIFORM_BUFFER,m,E.__data)}}function A(E,M,x){typeof E=="number"||typeof E=="boolean"?M[0]=E:E.isMatrix3?(M[0]=E.elements[0],M[1]=E.elements[1],M[2]=E.elements[2],M[3]=0,M[4]=E.elements[3],M[5]=E.elements[4],M[6]=E.elements[5],M[7]=0,M[8]=E.elements[6],M[9]=E.elements[7],M[10]=E.elements[8],M[11]=0):ArrayBuffer.isView(E)?M.set(new E.constructor(E.buffer,E.byteOffset,M.length)):E.toArray(M,x)}function U(E,M,x,L){const m=E.value,T=M+"_"+x;if(L[T]===void 0)return typeof m=="number"||typeof m=="boolean"?L[T]=m:ArrayBuffer.isView(m)?L[T]=m.slice():L[T]=m.clone(),!0;{const y=L[T];if(typeof m=="number"||typeof m=="boolean"){if(y!==m)return L[T]=m,!0}else{if(ArrayBuffer.isView(m))return!0;if(y.equals(m)===!1)return y.copy(m),!0}}return!1}function h(E){const M=E.uniforms;let x=0;const L=16;for(let T=0,y=M.length;T<y;T++){const G=Array.isArray(M[T])?M[T]:[M[T]];for(let k=0,q=G.length;k<q;k++){const N=G[k],K=Array.isArray(N.value)?N.value:[N.value];for(let j=0,Y=K.length;j<Y;j++){const ne=K[j],Z=f(ne),J=x%L,ee=J%Z.boundary,be=J+ee;x+=ee,be!==0&&L-be<Z.storage&&(x+=L-be),N.__data=new Float32Array(Z.storage/Float32Array.BYTES_PER_ELEMENT),N.__offset=x,x+=Z.storage}}}const m=x%L;return m>0&&(x+=L-m),E.__size=x,E.__cache={},this}function f(E){const M={boundary:0,storage:0};return typeof E=="number"||typeof E=="boolean"?(M.boundary=4,M.storage=4):E.isVector2?(M.boundary=8,M.storage=8):E.isVector3||E.isColor?(M.boundary=16,M.storage=12):E.isVector4?(M.boundary=16,M.storage=16):E.isMatrix3?(M.boundary=48,M.storage=48):E.isMatrix4?(M.boundary=64,M.storage=64):E.isTexture?ze("WebGLRenderer: Texture samplers can not be part of an uniforms group."):ArrayBuffer.isView(E)?(M.boundary=16,M.storage=E.byteLength):ze("WebGLRenderer: Unsupported uniform value type.",E),M}function P(E){const M=E.target;M.removeEventListener("dispose",P);const x=o.indexOf(M.__bindingPointIndex);o.splice(x,1),e.deleteBuffer(a[M.id]),delete a[M.id],delete r[M.id]}function F(){for(const E in a)e.deleteBuffer(a[E]);o=[],a={},r={}}return{bind:l,update:d,dispose:F}}const Rd=new Uint16Array([12469,15057,12620,14925,13266,14620,13807,14376,14323,13990,14545,13625,14713,13328,14840,12882,14931,12528,14996,12233,15039,11829,15066,11525,15080,11295,15085,10976,15082,10705,15073,10495,13880,14564,13898,14542,13977,14430,14158,14124,14393,13732,14556,13410,14702,12996,14814,12596,14891,12291,14937,11834,14957,11489,14958,11194,14943,10803,14921,10506,14893,10278,14858,9960,14484,14039,14487,14025,14499,13941,14524,13740,14574,13468,14654,13106,14743,12678,14818,12344,14867,11893,14889,11509,14893,11180,14881,10751,14852,10428,14812,10128,14765,9754,14712,9466,14764,13480,14764,13475,14766,13440,14766,13347,14769,13070,14786,12713,14816,12387,14844,11957,14860,11549,14868,11215,14855,10751,14825,10403,14782,10044,14729,9651,14666,9352,14599,9029,14967,12835,14966,12831,14963,12804,14954,12723,14936,12564,14917,12347,14900,11958,14886,11569,14878,11247,14859,10765,14828,10401,14784,10011,14727,9600,14660,9289,14586,8893,14508,8533,15111,12234,15110,12234,15104,12216,15092,12156,15067,12010,15028,11776,14981,11500,14942,11205,14902,10752,14861,10393,14812,9991,14752,9570,14682,9252,14603,8808,14519,8445,14431,8145,15209,11449,15208,11451,15202,11451,15190,11438,15163,11384,15117,11274,15055,10979,14994,10648,14932,10343,14871,9936,14803,9532,14729,9218,14645,8742,14556,8381,14461,8020,14365,7603,15273,10603,15272,10607,15267,10619,15256,10631,15231,10614,15182,10535,15118,10389,15042,10167,14963,9787,14883,9447,14800,9115,14710,8665,14615,8318,14514,7911,14411,7507,14279,7198,15314,9675,15313,9683,15309,9712,15298,9759,15277,9797,15229,9773,15166,9668,15084,9487,14995,9274,14898,8910,14800,8539,14697,8234,14590,7790,14479,7409,14367,7067,14178,6621,15337,8619,15337,8631,15333,8677,15325,8769,15305,8871,15264,8940,15202,8909,15119,8775,15022,8565,14916,8328,14804,8009,14688,7614,14569,7287,14448,6888,14321,6483,14088,6171,15350,7402,15350,7419,15347,7480,15340,7613,15322,7804,15287,7973,15229,8057,15148,8012,15046,7846,14933,7611,14810,7357,14682,7069,14552,6656,14421,6316,14251,5948,14007,5528,15356,5942,15356,5977,15353,6119,15348,6294,15332,6551,15302,6824,15249,7044,15171,7122,15070,7050,14949,6861,14818,6611,14679,6349,14538,6067,14398,5651,14189,5311,13935,4958,15359,4123,15359,4153,15356,4296,15353,4646,15338,5160,15311,5508,15263,5829,15188,6042,15088,6094,14966,6001,14826,5796,14678,5543,14527,5287,14377,4985,14133,4586,13869,4257,15360,1563,15360,1642,15358,2076,15354,2636,15341,3350,15317,4019,15273,4429,15203,4732,15105,4911,14981,4932,14836,4818,14679,4621,14517,4386,14359,4156,14083,3795,13808,3437,15360,122,15360,137,15358,285,15355,636,15344,1274,15322,2177,15281,2765,15215,3223,15120,3451,14995,3569,14846,3567,14681,3466,14511,3305,14344,3121,14037,2800,13753,2467,15360,0,15360,1,15359,21,15355,89,15346,253,15325,479,15287,796,15225,1148,15133,1492,15008,1749,14856,1882,14685,1886,14506,1783,14324,1608,13996,1398,13702,1183]);let Pt=null;function bd(){return Pt===null&&(Pt=new Ro(Rd,16,16,dn,Vt),Pt.name="DFG_LUT",Pt.minFilter=mt,Pt.magFilter=mt,Pt.wrapS=yn,Pt.wrapT=yn,Pt.generateMipmaps=!1,Pt.needsUpdate=!0),Pt}class cp{constructor(n={}){const{canvas:t=Wa(),context:i=null,depth:a=!0,stencil:r=!1,alpha:o=!1,antialias:c=!1,premultipliedAlpha:l=!0,preserveDrawingBuffer:d=!1,powerPreference:_="default",failIfMajorPerformanceCaveat:g=!1,reversedDepthBuffer:p=!1,outputBufferType:v=Dt}=n;this.isWebGLRenderer=!0;let A;if(i!==null){if(typeof WebGLRenderingContext<"u"&&i instanceof WebGLRenderingContext)throw new Error("THREE.WebGLRenderer: WebGL 1 is not supported since r163.");A=i.getContextAttributes().alpha}else A=o;const U=v,h=new Set([ea,ta,na]),f=new Set([Dt,Jt,Bn,Rn,ia,ra]),P=new Uint32Array(4),F=new Int32Array(4),E=new Le;let M=null,x=null;const L=[],m=[];let T=null;this.domElement=t,this.debug={checkShaderErrors:!0,diagnostics:{keywords:!1},onShaderError:null},this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this.toneMapping=Nt,this.toneMappingExposure=1,this.transmissionResolutionScale=1;const y=this;let G=!1,k=null,q=null,N=null,K=null;this._outputColorSpace=fn;let j=0,Y=0,ne=null,Z=-1,J=null;const ee=new Et,be=new Et;let Re=null;const rt=new He(0);let Xe=0,Ke=t.width,W=t.height,$=1,Ee=null,Ue=null;const me=new Et(0,0,Ke,W),Oe=new Et(0,0,Ke,W);let lt=!1;const Ie=new jr;let Ge=!1,Ze=!1;const ye=new yt,nt=new Le,dt=new Et,vt={background:null,fog:null,environment:null,overrideMaterial:null,isScene:!0};let it=!1;function st(){return ne===null?$:1}let C=i;function pt(u,R){return t.getContext(u,R)}let We,S,s,w,O,H,te,ie,V,X,re,xe,ce,ae,Me,Ae,Ce,b,oe,z,se,de,Q;try{const u={alpha:!0,depth:a,stencil:r,antialias:c,premultipliedAlpha:l,preserveDrawingBuffer:d,powerPreference:_,failIfMajorPerformanceCaveat:g};if("setAttribute"in t&&t.setAttribute("data-engine",`three.js r${za}`),t.addEventListener("webglcontextlost",$e,!1),t.addEventListener("webglcontextrestored",Ve,!1),t.addEventListener("webglcontextcreationerror",At,!1),C===null){const R="webgl2";if(C=pt(R,u),C===null)throw pt(R)?new Error("THREE.WebGLRenderer: Error creating WebGL context with your selected attributes."):new Error("THREE.WebGLRenderer: Error creating WebGL context.")}Te()}catch(u){throw t.removeEventListener("webglcontextlost",$e,!1),t.removeEventListener("webglcontextrestored",Ve,!1),t.removeEventListener("webglcontextcreationerror",At,!1),et("WebGLRenderer: "+u.message),u}function Te(){We=new bf(C),We.init(),se=new gd(C,We),S=new _f(C,We,n,se),s=new md(C,We),S.reversedDepthBuffer&&p&&s.buffers.depth.setReversed(!0),q=C.createFramebuffer(),N=C.createFramebuffer(),K=C.createFramebuffer(),w=new Pf(C),O=new td,H=new _d(C,We,s,O,S,se,w),te=new Rf(y),ie=new ws(C),de=new hf(C,ie),V=new Cf(C,ie,w,de),X=new Uf(C,V,ie,de,w),b=new wf(C,S,H),Me=new gf(O),re=new ed(y,te,We,S,de,Me),xe=new Td(y,O),ce=new id,ae=new ld(We),Ce=new pf(y,te,s,X,A,l),Ae=new hd(y,X,S),Q=new Ad(C,w,S,s),oe=new mf(C,We,w),z=new Lf(C,We,w),w.programs=re.programs,y.capabilities=S,y.extensions=We,y.properties=O,y.renderLists=ce,y.shadowMap=Ae,y.state=s,y.info=w}U!==Dt&&(T=new If(U,t.width,t.height,c,a,r));const ve=new xd(y,C);this.xr=ve,this.getContext=function(){return C},this.getContextAttributes=function(){return C.getContextAttributes()},this.forceContextLoss=function(){const u=We.get("WEBGL_lose_context");u&&u.loseContext()},this.forceContextRestore=function(){const u=We.get("WEBGL_lose_context");u&&u.restoreContext()},this.getPixelRatio=function(){return $},this.setPixelRatio=function(u){u!==void 0&&($=u,this.setSize(Ke,W,!1))},this.getSize=function(u){return u.set(Ke,W)},this.setSize=function(u,R,B=!0){if(ve.isPresenting){ze("WebGLRenderer: Can't change size while VR device is presenting.");return}Ke=u,W=R,t.width=Math.floor(u*$),t.height=Math.floor(R*$),B===!0&&(t.style.width=u+"px",t.style.height=R+"px"),T!==null&&T.setSize(t.width,t.height),this.setViewport(0,0,u,R)},this.getDrawingBufferSize=function(u){return u.set(Ke*$,W*$).floor()},this.setDrawingBufferSize=function(u,R,B){Ke=u,W=R,$=B,t.width=Math.floor(u*B),t.height=Math.floor(R*B),this.setViewport(0,0,u,R)},this.setEffects=function(u){if(U===Dt){et("WebGLRenderer: setEffects() requires outputBufferType set to HalfFloatType or FloatType.");return}if(u){for(let R=0;R<u.length;R++)if(u[R].isOutputPass===!0){ze("WebGLRenderer: OutputPass is not needed in setEffects(). Tone mapping and color space conversion are applied automatically.");break}}T.setEffects(u||[])},this.getCurrentViewport=function(u){return u.copy(ee)},this.getViewport=function(u){return u.copy(me)},this.setViewport=function(u,R,B,D){u.isVector4?me.set(u.x,u.y,u.z,u.w):me.set(u,R,B,D),s.viewport(ee.copy(me).multiplyScalar($).round())},this.getScissor=function(u){return u.copy(Oe)},this.setScissor=function(u,R,B,D){u.isVector4?Oe.set(u.x,u.y,u.z,u.w):Oe.set(u,R,B,D),s.scissor(be.copy(Oe).multiplyScalar($).round())},this.getScissorTest=function(){return lt},this.setScissorTest=function(u){s.setScissorTest(lt=u)},this.setOpaqueSort=function(u){Ee=u},this.setTransparentSort=function(u){Ue=u},this.getClearColor=function(u){return u.copy(Ce.getClearColor())},this.setClearColor=function(){Ce.setClearColor(...arguments)},this.getClearAlpha=function(){return Ce.getClearAlpha()},this.setClearAlpha=function(){Ce.setClearAlpha(...arguments)},this.clear=function(u=!0,R=!0,B=!0){let D=0;if(u){let I=!1;if(ne!==null){const ue=ne.texture.format;I=h.has(ue)}if(I){const ue=ne.texture.type,he=f.has(ue),fe=Ce.getClearColor(),_e=Ce.getClearAlpha(),Se=fe.r,Pe=fe.g,Ne=fe.b;he?(P[0]=Se,P[1]=Pe,P[2]=Ne,P[3]=_e,C.clearBufferuiv(C.COLOR,0,P)):(F[0]=Se,F[1]=Pe,F[2]=Ne,F[3]=_e,C.clearBufferiv(C.COLOR,0,F))}else D|=C.COLOR_BUFFER_BIT}R&&(D|=C.DEPTH_BUFFER_BIT,this.state.buffers.depth.setMask(!0)),B&&(D|=C.STENCIL_BUFFER_BIT,this.state.buffers.stencil.setMask(4294967295)),D!==0&&C.clear(D)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.setNodesHandler=function(u){u.setRenderer(this),k=u},this.dispose=function(){t.removeEventListener("webglcontextlost",$e,!1),t.removeEventListener("webglcontextrestored",Ve,!1),t.removeEventListener("webglcontextcreationerror",At,!1),Ce.dispose(),ce.dispose(),ae.dispose(),O.dispose(),te.dispose(),X.dispose(),de.dispose(),Q.dispose(),re.dispose(),ve.dispose(),ve.removeEventListener("sessionstart",Mi),ve.removeEventListener("sessionend",Ti),Zt.stop()};function $e(u){u.preventDefault(),Ui("WebGLRenderer: Context Lost."),G=!0}function Ve(){Ui("WebGLRenderer: Context Restored."),G=!1;const u=w.autoReset,R=Ae.enabled,B=Ae.autoUpdate,D=Ae.needsUpdate,I=Ae.type;Te(),w.autoReset=u,Ae.enabled=R,Ae.autoUpdate=B,Ae.needsUpdate=D,Ae.type=I}function At(u){et("WebGLRenderer: A WebGL context could not be created. Reason: ",u.statusMessage)}function Ct(u){const R=u.target;R.removeEventListener("dispose",Ct),Oa(R)}function Oa(u){Fa(u),O.remove(u)}function Fa(u){const R=O.get(u).programs;R!==void 0&&(R.forEach(function(B){re.releaseProgram(B)}),u.isShaderMaterial&&re.releaseShaderCache(u))}this.renderBufferDirect=function(u,R,B,D,I,ue){R===null&&(R=vt);const he=I.isMesh&&I.matrixWorld.determinantAffine()<0,fe=Ha(u,R,B,D,I);s.setMaterial(D,he);let _e=B.index,Se=1;if(D.wireframe===!0){if(_e=V.getWireframeAttribute(B),_e===void 0)return;Se=2}const Pe=B.drawRange,Ne=B.attributes.position;let ge=Pe.start*Se,ke=(Pe.start+Pe.count)*Se;ue!==null&&(ge=Math.max(ge,ue.start*Se),ke=Math.min(ke,(ue.start+ue.count)*Se)),_e!==null?(ge=Math.max(ge,0),ke=Math.min(ke,_e.count)):Ne!=null&&(ge=Math.max(ge,0),ke=Math.min(ke,Ne.count));const ct=ke-ge;if(ct<0||ct===1/0)return;de.setup(I,D,fe,B,_e);let Je,qe=oe;if(_e!==null&&(Je=ie.get(_e),qe=z,qe.setIndex(Je)),I.isMesh)D.wireframe===!0?(s.setLineWidth(D.wireframeLinewidth*st()),qe.setMode(C.LINES)):qe.setMode(C.TRIANGLES);else if(I.isLine){let ht=D.linewidth;ht===void 0&&(ht=1),s.setLineWidth(ht*st()),I.isLineSegments?qe.setMode(C.LINES):I.isLineLoop?qe.setMode(C.LINE_LOOP):qe.setMode(C.LINE_STRIP)}else I.isPoints?qe.setMode(C.POINTS):I.isSprite&&qe.setMode(C.TRIANGLES);if(I.isBatchedMesh)if(We.get("WEBGL_multi_draw"))qe.renderMultiDraw(I._multiDrawStarts,I._multiDrawCounts,I._multiDrawCount);else{const ht=I._multiDrawStarts,pe=I._multiDrawCounts,gt=I._multiDrawCount,Be=_e?ie.get(_e).bytesPerElement:1,Mt=O.get(D).currentProgram.getUniforms();for(let Lt=0;Lt<gt;Lt++)Mt.setValue(C,"_gl_DrawID",Lt),qe.render(ht[Lt]/Be,pe[Lt])}else if(I.isInstancedMesh)qe.renderInstances(ge,ct,I.count);else if(B.isInstancedBufferGeometry){const ht=B._maxInstanceCount!==void 0?B._maxInstanceCount:1/0,pe=Math.min(B.instanceCount,ht);qe.renderInstances(ge,ct,pe)}else qe.render(ge,ct)};function xi(u,R,B,D){k!==null&&u.isNodeMaterial&&k.setObject(D,u),Ge===!0&&Me.setState(u,B,!1),u.transparent===!0&&u.side===It&&u.forceSinglePass===!1?(u.side=xt,u.needsUpdate=!0,Ln(u,R,D),u.side=un,u.needsUpdate=!0,Ln(u,R,D),u.side=It):Ln(u,R,D)}this.compile=function(u,R,B=null){B===null&&(B=u),k!==null&&k.renderStart(u,R,B),x=ae.get(B),x.init(R),m.push(x),B.traverseVisible(function(I){I.isLight&&I.layers.test(R.layers)&&(x.pushLight(I),I.castShadow&&x.pushShadow(I))}),u!==B&&u.traverseVisible(function(I){I.isLight&&I.layers.test(R.layers)&&(x.pushLight(I),I.castShadow&&x.pushShadow(I))}),x.setupLights(),k!==null&&k.updateLights(x.state.lightsArray),Ze=this.localClippingEnabled,Ge=Me.init(this.clippingPlanes,Ze),Ge===!0&&Me.setGlobalState(this.clippingPlanes,R),k!==null&&Ae.render(x.state.shadowsArray,B,R);const D=new Set;return u.traverse(function(I){if(!(I.isMesh||I.isPoints||I.isLine||I.isSprite))return;const ue=I.material;if(ue)if(Array.isArray(ue))for(let he=0;he<ue.length;he++){const fe=ue[he];xi(fe,B,R,I),D.add(fe)}else xi(ue,B,R,I),D.add(ue)}),x=m.pop(),k!==null&&k.renderEnd(),D},this.compileAsync=function(u,R,B=null){const D=this.compile(u,R,B);return new Promise(I=>{function ue(){if(D.forEach(function(he){const _e=O.get(he).currentProgram;(_e===void 0||_e.isReady())&&D.delete(he)}),D.size===0){I(u);return}setTimeout(ue,10)}We.get("KHR_parallel_shader_compile")!==null?ue():setTimeout(ue,10)})};let kn=null;function Ba(u){kn&&kn(u)}function Mi(){Zt.stop()}function Ti(){Zt.start()}const Zt=new Ra;Zt.setAnimationLoop(Ba),typeof self<"u"&&Zt.setContext(self),this.setAnimationLoop=function(u){kn=u,ve.setAnimationLoop(u),u===null?Zt.stop():Zt.start()},ve.addEventListener("sessionstart",Mi),ve.addEventListener("sessionend",Ti),this.render=function(u,R){if(R!==void 0&&R.isCamera!==!0){et("WebGLRenderer.render: camera is not an instance of THREE.Camera.");return}if(G===!0)return;k!==null&&k.renderStart(u,R);const B=ve.enabled===!0&&ve.isPresenting===!0,D=T!==null&&(ne===null||B)&&T.begin(y,ne);if(u.matrixWorldAutoUpdate===!0&&u.updateMatrixWorld(),R.parent===null&&R.matrixWorldAutoUpdate===!0&&R.updateMatrixWorld(),ve.enabled===!0&&ve.isPresenting===!0&&(T===null||T.isCompositing()===!1)&&(ve.cameraAutoUpdate===!0&&ve.updateCamera(R),R=ve.getCamera()),u.isScene===!0&&u.onBeforeRender(y,u,R,ne),x=ae.get(u,m.length),x.init(R),x.state.textureUnits=H.getTextureUnits(),m.push(x),ye.multiplyMatrices(R.projectionMatrix,R.matrixWorldInverse),Ie.setFromProjectionMatrix(ye,Di,R.reversedDepth),Ze=this.localClippingEnabled,Ge=Me.init(this.clippingPlanes,Ze),M=ce.get(u,L.length),M.init(),L.push(M),ve.enabled===!0&&ve.isPresenting===!0){const he=y.xr.getDepthSensingMesh();he!==null&&Wn(he,R,-1/0,y.sortObjects)}Wn(u,R,0,y.sortObjects),M.finish(),k!==null&&k.updateLights(x.state.lightsArray),y.sortObjects===!0&&M.sort(Ee,Ue),it=ve.enabled===!1||ve.isPresenting===!1||ve.hasDepthSensing()===!1,it&&Ce.addToRenderList(M,u),this.info.render.frame++,this.info.autoReset===!0&&this.info.reset(),Ge===!0&&Me.beginShadows();const I=x.state.shadowsArray;if(Ae.render(I,u,R),Ge===!0&&Me.endShadows(),(D&&T.hasRenderPass())===!1){const he=M.opaque,fe=M.transmissive;if(x.setupLights(),R.isArrayCamera){const _e=R.cameras;if(fe.length>0)for(let Se=0,Pe=_e.length;Se<Pe;Se++){const Ne=_e[Se];Ri(he,fe,u,Ne)}it&&Ce.render(u);for(let Se=0,Pe=_e.length;Se<Pe;Se++){const Ne=_e[Se];Ai(M,u,Ne,Ne.viewport)}}else fe.length>0&&Ri(he,fe,u,R),it&&Ce.render(u),Ai(M,u,R)}ne!==null&&Y===0&&(H.updateMultisampleRenderTarget(ne),H.updateRenderTargetMipmap(ne)),D&&T.end(y),u.isScene===!0&&u.onAfterRender(y,u,R),de.resetDefaultState(),Z=-1,J=null,m.pop(),m.length>0?(x=m[m.length-1],H.setTextureUnits(x.state.textureUnits),Ge===!0&&Me.setGlobalState(y.clippingPlanes,x.state.camera)):x=null,L.pop(),L.length>0?M=L[L.length-1]:M=null,k!==null&&k.renderEnd()};function Wn(u,R,B,D){if(u.visible===!1)return;if(u.layers.test(R.layers)){if(u.isGroup)B=u.renderOrder;else if(u.isLOD)u.autoUpdate===!0&&u.update(R);else if(u.isLightProbeGrid)x.pushLightProbeGrid(u);else if(u.isLight)x.pushLight(u),u.castShadow&&x.pushShadow(u);else if(u.isSprite){if(!u.frustumCulled||u.intersectsFrustum(Ie)){D&&dt.setFromMatrixPosition(u.matrixWorld).applyMatrix4(ye);const he=X.update(u),fe=u.material;fe.visible&&M.push(u,he,fe,B,dt.z,null,R)}}else if((u.isMesh||u.isLine||u.isPoints)&&(!u.frustumCulled||u.intersectsFrustum(Ie))){const he=X.update(u),fe=u.material;if(D&&(u.boundingSphere!==void 0?(u.boundingSphere===null&&u.computeBoundingSphere(),dt.copy(u.boundingSphere.center)):(he.boundingSphere===null&&he.computeBoundingSphere(),dt.copy(he.boundingSphere.center)),dt.applyMatrix4(u.matrixWorld).applyMatrix4(ye)),Array.isArray(fe)){const _e=he.groups;for(let Se=0,Pe=_e.length;Se<Pe;Se++){const Ne=_e[Se],ge=fe[Ne.materialIndex];ge&&ge.visible&&M.push(u,he,ge,B,dt.z,Ne,R)}}else fe.visible&&M.push(u,he,fe,B,dt.z,null,R)}}const ue=u.children;for(let he=0,fe=ue.length;he<fe;he++)Wn(ue[he],R,B,D)}function Ai(u,R,B,D){const{opaque:I,transmissive:ue,transparent:he}=u;x.setupLightsView(B),Ge===!0&&Me.setGlobalState(y.clippingPlanes,B),D&&s.viewport(ee.copy(D)),I.length>0&&Cn(I,R,B),ue.length>0&&Cn(ue,R,B),he.length>0&&Cn(he,R,B),s.buffers.depth.setTest(!0),s.buffers.depth.setMask(!0),s.buffers.color.setMask(!0),s.setPolygonOffset(!1)}function Ri(u,R,B,D){if((B.isScene===!0?B.overrideMaterial:null)!==null)return;if(x.state.transmissionRenderTarget[D.id]===void 0){const ge=We.has("EXT_color_buffer_half_float")||We.has("EXT_color_buffer_float");x.state.transmissionRenderTarget[D.id]=new Rt(1,1,{generateMipmaps:!0,type:ge?Vt:Dt,minFilter:Yt,samples:Math.max(4,S.samples),stencilBuffer:r,resolveDepthBuffer:!1,resolveStencilBuffer:!1,storeMultisampledDepthBuffer:!1,storeMultisampledStencilBuffer:!1,colorSpace:tt.workingColorSpace})}const ue=x.state.transmissionRenderTarget[D.id],he=D.viewport||ee;ue.setSize(he.z*y.transmissionResolutionScale,he.w*y.transmissionResolutionScale);const fe=y.getRenderTarget(),_e=y.getActiveCubeFace(),Se=y.getActiveMipmapLevel();y.setRenderTarget(ue),y.getClearColor(rt),Xe=y.getClearAlpha(),Xe<1&&y.setClearColor(16777215,.5),y.clear(),it&&Ce.render(B);const Pe=y.toneMapping;y.toneMapping=Nt;const Ne=D.viewport;if(D.viewport!==void 0&&(D.viewport=void 0),x.setupLightsView(D),Ge===!0&&Me.setGlobalState(y.clippingPlanes,D),Cn(u,B,D),H.updateMultisampleRenderTarget(ue),H.updateRenderTargetMipmap(ue),We.has("WEBGL_multisampled_render_to_texture")===!1){let ge=!1;for(let ke=0,ct=R.length;ke<ct;ke++){const Je=R[ke],{object:qe,geometry:ht,material:pe,group:gt}=Je;if(pe.side===It&&qe.layers.test(D.layers)){const Be=pe.side;pe.side=xt,pe.needsUpdate=!0,bi(qe,B,D,ht,pe,gt),pe.side=Be,pe.needsUpdate=!0,ge=!0}}ge===!0&&(H.updateMultisampleRenderTarget(ue),H.updateRenderTargetMipmap(ue))}y.setRenderTarget(fe,_e,Se),y.setClearColor(rt,Xe),Ne!==void 0&&(D.viewport=Ne),y.toneMapping=Pe}function Cn(u,R,B){const D=R.isScene===!0?R.overrideMaterial:null;for(let I=0,ue=u.length;I<ue;I++){const he=u[I],{object:fe,geometry:_e,group:Se}=he;let Pe=he.material;Pe.allowOverride===!0&&D!==null&&(Pe=D),fe.layers.test(B.layers)&&bi(fe,R,B,_e,Pe,Se)}}function bi(u,R,B,D,I,ue){k!==null&&I.isNodeMaterial&&k.setObject(u,I),u.onBeforeRender(y,R,B,D,I,ue),u.modelViewMatrix.multiplyMatrices(B.matrixWorldInverse,u.matrixWorld),u.normalMatrix.getNormalMatrix(u.modelViewMatrix),I.onBeforeRender(y,R,B,D,u,ue),I.transparent===!0&&I.side===It&&I.forceSinglePass===!1?(I.side=xt,I.needsUpdate=!0,y.renderBufferDirect(B,R,D,I,u,ue),I.side=un,I.needsUpdate=!0,y.renderBufferDirect(B,R,D,I,u,ue),I.side=It):y.renderBufferDirect(B,R,D,I,u,ue),u.onAfterRender(y,R,B,D,I,ue)}function Ln(u,R,B){R.isScene!==!0&&(R=vt);const D=O.get(u),I=x.state.lights,ue=x.state.shadowsArray,he=I.state.version,fe=re.getParameters(u,I.state,ue,R,B,x.state.lightProbeGridArray),_e=re.getProgramCacheKey(fe);let Se=D.programs;D.environment=u.isMeshStandardMaterial||u.isMeshLambertMaterial||u.isMeshPhongMaterial?R.environment:null,D.fog=R.fog;const Pe=u.isMeshStandardMaterial||u.isMeshLambertMaterial&&!u.envMap||u.isMeshPhongMaterial&&!u.envMap;D.envMap=te.get(u.envMap||D.environment,Pe),D.envMapRotation=D.environment!==null&&u.envMap===null?R.environmentRotation:u.envMapRotation,Se===void 0&&(u.addEventListener("dispose",Ct),Se=new Map,D.programs=Se);let Ne=Se.get(_e);if(Ne!==void 0){if(D.currentProgram===Ne&&D.lightsStateVersion===he)return Li(u,fe),Ne}else fe.uniforms=re.getUniforms(u),k!==null&&u.isNodeMaterial&&k.build(u,B,fe),u.onBeforeCompile(fe,y),Ne=re.acquireProgram(fe,_e),Se.set(_e,Ne),D.uniforms=fe.uniforms;const ge=D.uniforms;return(!u.isShaderMaterial&&!u.isRawShaderMaterial||u.clipping===!0)&&(ge.clippingPlanes=Me.uniform),Li(u,fe),D.needsLights=ka(u),D.lightsStateVersion=he,D.needsLights&&(ge.ambientLightColor.value=I.state.ambient,ge.lightProbe.value=I.state.probe,ge.sunLights.value=I.state.sun,ge.sunLightShadows.value=I.state.sunShadow,ge.directionalLights.value=I.state.directional,ge.directionalLightShadows.value=I.state.directionalShadow,ge.spotLights.value=I.state.spot,ge.spotLightShadows.value=I.state.spotShadow,ge.rectAreaLights.value=I.state.rectArea,ge.ltc_1.value=I.state.rectAreaLTC1,ge.ltc_2.value=I.state.rectAreaLTC2,ge.pointLights.value=I.state.point,ge.pointLightShadows.value=I.state.pointShadow,ge.hemisphereLights.value=I.state.hemi,ge.sunShadowMatrix.value=I.state.sunShadowMatrix,ge.sunShadowCascade.value=I.state.sunShadowCascade,ge.directionalShadowMatrix.value=I.state.directionalShadowMatrix,ge.spotLightMatrix.value=I.state.spotLightMatrix,ge.spotLightMap.value=I.state.spotLightMap,ge.pointShadowMatrix.value=I.state.pointShadowMatrix),D.lightProbeGrid=x.state.lightProbeGridArray.length>0,D.currentProgram=Ne,D.uniformsList=null,Ne}function Ci(u){if(u.uniformsList===null){const R=u.currentProgram.getUniforms();u.uniformsList=Nn.seqWithValue(R.seq,u.uniforms)}return u.uniformsList}function Li(u,R){const B=O.get(u);B.outputColorSpace=R.outputColorSpace,B.batching=R.batching,B.batchingColor=R.batchingColor,B.instancing=R.instancing,B.instancingColor=R.instancingColor,B.instancingMorph=R.instancingMorph,B.skinning=R.skinning,B.morphTargets=R.morphTargets,B.morphNormals=R.morphNormals,B.morphColors=R.morphColors,B.morphTargetsCount=R.morphTargetsCount,B.numClippingPlanes=R.numClippingPlanes,B.numIntersection=R.numClipIntersection,B.vertexAlphas=R.vertexAlphas,B.vertexTangents=R.vertexTangents,B.toneMapping=R.toneMapping}function Ga(u,R){if(u.length===0)return null;if(u.length===1)return u[0].texture!==null?u[0]:null;E.setFromMatrixPosition(R.matrixWorld);for(let B=0,D=u.length;B<D;B++){const I=u[B];if(I.texture!==null&&I.boundingBox.containsPoint(E))return I}return null}function Ha(u,R,B,D,I){R.isScene!==!0&&(R=vt),H.resetTextureUnits();const ue=R.fog,he=D.isMeshStandardMaterial||D.isMeshLambertMaterial||D.isMeshPhongMaterial?R.environment:null,fe=ne===null?y.outputColorSpace:ne.isXRRenderTarget===!0?ne.texture.colorSpace:tt.workingColorSpace,_e=D.isMeshStandardMaterial||D.isMeshLambertMaterial&&!D.envMap||D.isMeshPhongMaterial&&!D.envMap,Se=te.get(D.envMap||he,_e),Pe=D.vertexColors===!0&&!!B.attributes.color&&B.attributes.color.itemSize===4,Ne=!!B.attributes.tangent&&(!!D.normalMap||D.anisotropy>0),ge=!!B.morphAttributes.position,ke=!!B.morphAttributes.normal,ct=!!B.morphAttributes.color;let Je=Nt;D.toneMapped&&(ne===null||ne.isXRRenderTarget===!0)&&(Je=y.toneMapping);const qe=B.morphAttributes.position||B.morphAttributes.normal||B.morphAttributes.color,ht=qe!==void 0?qe.length:0,pe=O.get(D),gt=x.state.lights;if(Ge===!0&&(Ze===!0||u!==J)){const je=u===J&&D.id===Z;Me.setState(D,u,je)}let Be=!1;D.version===pe.__version?(pe.needsLights&&pe.lightsStateVersion!==gt.state.version||pe.outputColorSpace!==fe||I.isBatchedMesh&&pe.batching===!1||!I.isBatchedMesh&&pe.batching===!0||I.isBatchedMesh&&pe.batchingColor===!0&&I._colorsTexture===null||I.isBatchedMesh&&pe.batchingColor===!1&&I._colorsTexture!==null||I.isInstancedMesh&&pe.instancing===!1||!I.isInstancedMesh&&pe.instancing===!0||I.isSkinnedMesh&&pe.skinning===!1||!I.isSkinnedMesh&&pe.skinning===!0||I.isInstancedMesh&&pe.instancingColor===!0&&I.instanceColor===null||I.isInstancedMesh&&pe.instancingColor===!1&&I.instanceColor!==null||I.isInstancedMesh&&pe.instancingMorph===!0&&I.morphTexture===null||I.isInstancedMesh&&pe.instancingMorph===!1&&I.morphTexture!==null||pe.envMap!==Se||D.fog===!0&&pe.fog!==ue||pe.numClippingPlanes!==void 0&&(pe.numClippingPlanes!==Me.numPlanes||pe.numIntersection!==Me.numIntersection)||pe.vertexAlphas!==Pe||pe.vertexTangents!==Ne||pe.morphTargets!==ge||pe.morphNormals!==ke||pe.morphColors!==ct||pe.toneMapping!==Je||pe.morphTargetsCount!==ht||!!pe.lightProbeGrid!=x.state.lightProbeGridArray.length>0)&&(Be=!0):(Be=!0,pe.__version=D.version);let Mt=pe.currentProgram;Be===!0&&(Mt=Ln(D,R,I),k&&D.isNodeMaterial&&k.onUpdateProgram(D,Mt,pe));let Lt=!1,Wt=!1,tn=!1;const Ye=Mt.getUniforms(),at=pe.uniforms;if(s.useProgram(Mt.program)&&(Lt=!0,Wt=!0,tn=!0),D.id!==Z&&(Z=D.id,Wt=!0),pe.needsLights){const je=Ga(x.state.lightProbeGridArray,I);pe.lightProbeGrid!==je&&(pe.lightProbeGrid=je,Wt=!0)}if(Lt||J!==u){s.buffers.depth.getReversed()&&u.reversedDepth!==!0&&(u._reversedDepth=!0,u.updateProjectionMatrix()),Ye.setValue(C,"projectionMatrix",u.projectionMatrix),Ye.setValue(C,"viewMatrix",u.matrixWorldInverse);const Xt=Ye.map.cameraPosition;Xt!==void 0&&Xt.setValue(C,nt.setFromMatrixPosition(u.matrixWorld)),S.logarithmicDepthBuffer&&Ye.setValue(C,"logDepthBufFC",2/(Math.log(u.far+1)/Math.LN2)),(D.isMeshPhongMaterial||D.isMeshToonMaterial||D.isMeshLambertMaterial||D.isMeshBasicMaterial||D.isMeshStandardMaterial||D.isShaderMaterial)&&Ye.setValue(C,"isOrthographic",u.isOrthographicCamera===!0),J!==u&&(J=u,Wt=!0,tn=!0)}if(pe.needsLights&&(gt.state.sunShadowMap.length>0&&Ye.setValue(C,"sunShadowMap",gt.state.sunShadowMap,H),gt.state.directionalShadowMap.length>0&&Ye.setValue(C,"directionalShadowMap",gt.state.directionalShadowMap,H),gt.state.spotShadowMap.length>0&&Ye.setValue(C,"spotShadowMap",gt.state.spotShadowMap,H),gt.state.pointShadowMap.length>0&&Ye.setValue(C,"pointShadowMap",gt.state.pointShadowMap,H)),I.isSkinnedMesh){Ye.setOptional(C,I,"bindMatrix"),Ye.setOptional(C,I,"bindMatrixInverse");const je=I.skeleton;je&&(je.boneTexture===null&&je.computeBoneTexture(),Ye.setValue(C,"boneTexture",je.boneTexture,H))}I.isBatchedMesh&&(Ye.setOptional(C,I,"batchingTexture"),Ye.setValue(C,"batchingTexture",I._matricesTexture,H),Ye.setOptional(C,I,"batchingIdTexture"),Ye.setValue(C,"batchingIdTexture",I._indirectTexture,H),Ye.setOptional(C,I,"batchingColorTexture"),I._colorsTexture!==null&&Ye.setValue(C,"batchingColorTexture",I._colorsTexture,H));const zt=B.morphAttributes;if((zt.position!==void 0||zt.normal!==void 0||zt.color!==void 0)&&b.update(I,B,Mt),(Wt||pe.receiveShadow!==I.receiveShadow)&&(pe.receiveShadow=I.receiveShadow,Ye.setValue(C,"receiveShadow",I.receiveShadow)),(D.isMeshStandardMaterial||D.isMeshLambertMaterial||D.isMeshPhongMaterial)&&D.envMap===null&&R.environment!==null&&(at.envMapIntensity.value=R.environmentIntensity),at.dfgLUT!==void 0&&(at.dfgLUT.value=bd()),Wt){if(Ye.setValue(C,"toneMappingExposure",y.toneMappingExposure),pe.needsLights&&Va(at,tn),ue&&D.fog===!0&&xe.refreshFogUniforms(at,ue),xe.refreshMaterialUniforms(at,D,$,W,x.state.transmissionRenderTarget[u.id]),pe.needsLights&&pe.lightProbeGrid){const je=pe.lightProbeGrid;at.probesSH.value=je.texture,at.probesMin.value.copy(je.boundingBox.min),at.probesMax.value.copy(je.boundingBox.max),at.probesResolution.value.copy(je.resolution)}Nn.upload(C,Ci(pe),at,H)}if(D.isShaderMaterial&&D.uniformsNeedUpdate===!0&&(Nn.upload(C,Ci(pe),at,H),D.uniformsNeedUpdate=!1),D.isSpriteMaterial&&Ye.setValue(C,"center",I.center),Ye.setValue(C,"modelViewMatrix",I.modelViewMatrix),Ye.setValue(C,"normalMatrix",I.normalMatrix),Ye.setValue(C,"modelMatrix",I.matrixWorld),D.uniformsGroups!==void 0){const je=D.uniformsGroups;for(let Xt=0,nn=je.length;Xt<nn;Xt++){const wi=je[Xt];Q.update(wi,Mt),Q.bind(wi,Mt)}}return Mt}function Va(u,R){u.ambientLightColor.needsUpdate=R,u.lightProbe.needsUpdate=R,u.sunLights.needsUpdate=R,u.sunLightShadows.needsUpdate=R,u.directionalLights.needsUpdate=R,u.directionalLightShadows.needsUpdate=R,u.pointLights.needsUpdate=R,u.pointLightShadows.needsUpdate=R,u.spotLights.needsUpdate=R,u.spotLightShadows.needsUpdate=R,u.rectAreaLights.needsUpdate=R,u.hemisphereLights.needsUpdate=R}function ka(u){return u.isMeshLambertMaterial||u.isMeshToonMaterial||u.isMeshPhongMaterial||u.isMeshStandardMaterial||u.isShadowMaterial||u.isShaderMaterial&&u.lights===!0}this.getActiveCubeFace=function(){return j},this.getActiveMipmapLevel=function(){return Y},this.getRenderTarget=function(){return ne},this.setRenderTargetTextures=function(u,R,B){const D=O.get(u);D.__autoAllocateDepthBuffer=u.resolveDepthBuffer===!1,D.__autoAllocateDepthBuffer===!1&&(D.__useRenderToTexture=!1),O.get(u.texture).__webglTexture=R,O.get(u.depthTexture).__webglTexture=D.__autoAllocateDepthBuffer?void 0:B,D.__hasExternalTextures=!0},this.setRenderTargetFramebuffer=function(u,R){const B=O.get(u);B.__webglFramebuffer=R,B.__useDefaultFramebuffer=R===void 0},this.setRenderTarget=function(u,R=0,B=0){ne=u,j=R,Y=B;let D=null,I=!1,ue=!1;if(u){const fe=O.get(u);if(fe.__useDefaultFramebuffer!==void 0){s.bindFramebuffer(C.FRAMEBUFFER,fe.__webglFramebuffer),ee.copy(u.viewport),be.copy(u.scissor),Re=u.scissorTest,s.viewport(ee),s.scissor(be),s.setScissorTest(Re),Z=-1;return}else if(fe.__webglFramebuffer===void 0)H.setupRenderTarget(u);else if(fe.__hasExternalTextures)H.rebindTextures(u,O.get(u.texture).__webglTexture,O.get(u.depthTexture).__webglTexture);else if(u.depthBuffer){const Pe=u.depthTexture;if(fe.__boundDepthTexture!==Pe){if(Pe!==null&&O.has(Pe)&&(u.width!==Pe.image.width||u.height!==Pe.image.height))throw new Error("THREE.WebGLRenderer: Attached DepthTexture is initialized to the incorrect size.");H.setupDepthRenderbuffer(u)}}const _e=u.texture;(_e.isData3DTexture||_e.isDataArrayTexture||_e.isCompressedArrayTexture)&&(ue=!0);const Se=O.get(u).__webglFramebuffer;u.isWebGLCubeRenderTarget?(Array.isArray(Se[R])?D=Se[R][B]:D=Se[R],I=!0):u.samples>0&&H.useMultisampledRTT(u)===!1?D=O.get(u).__webglMultisampledFramebuffer:Array.isArray(Se)?D=Se[B]:D=Se,ee.copy(u.viewport),be.copy(u.scissor),Re=u.scissorTest}else ee.copy(me).multiplyScalar($).floor(),be.copy(Oe).multiplyScalar($).floor(),Re=lt;if(B!==0&&(D=q),s.bindFramebuffer(C.FRAMEBUFFER,D)&&s.drawBuffers(u,D),s.viewport(ee),s.scissor(be),s.setScissorTest(Re),I){const fe=O.get(u.texture);C.framebufferTexture2D(C.FRAMEBUFFER,C.COLOR_ATTACHMENT0,C.TEXTURE_CUBE_MAP_POSITIVE_X+R,fe.__webglTexture,B)}else if(ue){const fe=R;for(let _e=0;_e<u.textures.length;_e++){const Se=O.get(u.textures[_e]);C.framebufferTextureLayer(C.FRAMEBUFFER,C.COLOR_ATTACHMENT0+_e,Se.__webglTexture,B,fe)}}else if(u!==null&&B!==0){const fe=O.get(u.texture);C.framebufferTexture2D(C.FRAMEBUFFER,C.COLOR_ATTACHMENT0,C.TEXTURE_2D,fe.__webglTexture,B)}Z=-1};function Pi(u){const R=O.get(u);return(R.__readFormat!==u.format||R.__readType!==u.type)&&(R.__readFormat=u.format,R.__readType=u.type,R.__formatReadable=S.textureFormatReadable(u.format),R.__typeReadable=S.textureTypeReadable(u.type)),R}this.readRenderTargetPixels=function(u,R,B,D,I,ue,he,fe=0){if(!(u&&u.isWebGLRenderTarget)){et("WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");return}let _e=O.get(u).__webglFramebuffer;if(u.isWebGLCubeRenderTarget&&he!==void 0&&(_e=_e[he]),_e){s.bindFramebuffer(C.FRAMEBUFFER,_e);try{const Se=u.textures[fe],Pe=Se.format,Ne=Se.type;u.textures.length>1&&C.readBuffer(C.COLOR_ATTACHMENT0+fe);const ge=Pi(Se);if(ge.__formatReadable===!1){et("WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.");return}if(ge.__typeReadable===!1){et("WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.");return}R>=0&&R<=u.width-D&&B>=0&&B<=u.height-I&&C.readPixels(R,B,D,I,se.convert(Pe),se.convert(Ne),ue)}finally{const Se=ne!==null?O.get(ne).__webglFramebuffer:null;s.bindFramebuffer(C.FRAMEBUFFER,Se)}}},this.readRenderTargetPixelsAsync=async function(u,R,B,D,I,ue,he,fe=0){if(!(u&&u.isWebGLRenderTarget))throw new Error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");let _e=O.get(u).__webglFramebuffer;if(u.isWebGLCubeRenderTarget&&he!==void 0&&(_e=_e[he]),_e)if(R>=0&&R<=u.width-D&&B>=0&&B<=u.height-I){s.bindFramebuffer(C.FRAMEBUFFER,_e);const Se=u.textures[fe],Pe=Se.format,Ne=Se.type;u.textures.length>1&&C.readBuffer(C.COLOR_ATTACHMENT0+fe);const ge=Pi(Se);if(ge.__formatReadable===!1)throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in RGBA or implementation defined format.");if(ge.__typeReadable===!1)throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in UnsignedByteType or implementation defined type.");const ke=C.createBuffer();C.bindBuffer(C.PIXEL_PACK_BUFFER,ke),C.bufferData(C.PIXEL_PACK_BUFFER,ue.byteLength,C.STREAM_READ),C.readPixels(R,B,D,I,se.convert(Pe),se.convert(Ne),0),C.bindBuffer(C.PIXEL_PACK_BUFFER,null);const ct=ne!==null?O.get(ne).__webglFramebuffer:null;s.bindFramebuffer(C.FRAMEBUFFER,ct);const Je=C.fenceSync(C.SYNC_GPU_COMMANDS_COMPLETE,0);return C.flush(),await Xa(C,Je,4),C.bindBuffer(C.PIXEL_PACK_BUFFER,ke),C.getBufferSubData(C.PIXEL_PACK_BUFFER,0,ue),C.bindBuffer(C.PIXEL_PACK_BUFFER,null),C.deleteBuffer(ke),C.deleteSync(Je),ue}else throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: requested read bounds are out of range.")},this.copyFramebufferToTexture=function(u,R=null,B=0){const D=Math.pow(2,-B),I=Math.floor(u.image.width*D),ue=Math.floor(u.image.height*D),he=R!==null?R.x:0,fe=R!==null?R.y:0;H.setTexture2D(u,0),C.copyTexSubImage2D(C.TEXTURE_2D,B,0,0,he,fe,I,ue),s.unbindTexture()},this.copyTextureToTexture=function(u,R,B=null,D=null,I=0,ue=0){let he,fe,_e,Se,Pe,Ne,ge,ke,ct;const Je=u.isCompressedTexture?u.mipmaps[ue]:u.image;if(B!==null)he=B.max.x-B.min.x,fe=B.max.y-B.min.y,_e=B.isBox3?B.max.z-B.min.z:1,Se=B.min.x,Pe=B.min.y,Ne=B.isBox3?B.min.z:0;else{const at=Math.pow(2,-I);he=Math.floor(Je.width*at),fe=Math.floor(Je.height*at),u.isDataArrayTexture?_e=Je.depth:u.isData3DTexture?_e=Math.floor(Je.depth*at):_e=1,Se=0,Pe=0,Ne=0}D!==null?(ge=D.x,ke=D.y,ct=D.z):(ge=0,ke=0,ct=0);const qe=se.convert(R.format),ht=se.convert(R.type);let pe;R.isData3DTexture?(H.setTexture3D(R,0),pe=C.TEXTURE_3D):R.isDataArrayTexture||R.isCompressedArrayTexture?(H.setTexture2DArray(R,0),pe=C.TEXTURE_2D_ARRAY):(H.setTexture2D(R,0),pe=C.TEXTURE_2D),s.activeTexture(C.TEXTURE0),s.pixelStorei(C.UNPACK_FLIP_Y_WEBGL,R.flipY),s.pixelStorei(C.UNPACK_PREMULTIPLY_ALPHA_WEBGL,R.premultiplyAlpha),s.pixelStorei(C.UNPACK_ALIGNMENT,R.unpackAlignment);const gt=s.getParameter(C.UNPACK_ROW_LENGTH),Be=s.getParameter(C.UNPACK_IMAGE_HEIGHT),Mt=s.getParameter(C.UNPACK_SKIP_PIXELS),Lt=s.getParameter(C.UNPACK_SKIP_ROWS),Wt=s.getParameter(C.UNPACK_SKIP_IMAGES);s.pixelStorei(C.UNPACK_ROW_LENGTH,Je.width),s.pixelStorei(C.UNPACK_IMAGE_HEIGHT,Je.height),s.pixelStorei(C.UNPACK_SKIP_PIXELS,Se),s.pixelStorei(C.UNPACK_SKIP_ROWS,Pe),s.pixelStorei(C.UNPACK_SKIP_IMAGES,Ne);const tn=u.isDataArrayTexture||u.isData3DTexture,Ye=R.isDataArrayTexture||R.isData3DTexture;if(u.isDepthTexture){const at=O.get(u),zt=O.get(R),je=O.get(at.__renderTarget),Xt=O.get(zt.__renderTarget);s.bindFramebuffer(C.READ_FRAMEBUFFER,je.__webglFramebuffer),s.bindFramebuffer(C.DRAW_FRAMEBUFFER,Xt.__webglFramebuffer);for(let nn=0;nn<_e;nn++)tn&&(C.framebufferTextureLayer(C.READ_FRAMEBUFFER,C.COLOR_ATTACHMENT0,O.get(u).__webglTexture,I,Ne+nn),C.framebufferTextureLayer(C.DRAW_FRAMEBUFFER,C.COLOR_ATTACHMENT0,O.get(R).__webglTexture,ue,ct+nn)),C.blitFramebuffer(Se,Pe,he,fe,ge,ke,he,fe,C.DEPTH_BUFFER_BIT,C.NEAREST);s.bindFramebuffer(C.READ_FRAMEBUFFER,null),s.bindFramebuffer(C.DRAW_FRAMEBUFFER,null)}else if(I!==0||u.isRenderTargetTexture||O.has(u)){const at=O.get(u),zt=O.get(R);s.bindFramebuffer(C.READ_FRAMEBUFFER,N),s.bindFramebuffer(C.DRAW_FRAMEBUFFER,K);for(let je=0;je<_e;je++)tn?C.framebufferTextureLayer(C.READ_FRAMEBUFFER,C.COLOR_ATTACHMENT0,at.__webglTexture,I,Ne+je):C.framebufferTexture2D(C.READ_FRAMEBUFFER,C.COLOR_ATTACHMENT0,C.TEXTURE_2D,at.__webglTexture,I),Ye?C.framebufferTextureLayer(C.DRAW_FRAMEBUFFER,C.COLOR_ATTACHMENT0,zt.__webglTexture,ue,ct+je):C.framebufferTexture2D(C.DRAW_FRAMEBUFFER,C.COLOR_ATTACHMENT0,C.TEXTURE_2D,zt.__webglTexture,ue),I!==0?C.blitFramebuffer(Se,Pe,he,fe,ge,ke,he,fe,C.COLOR_BUFFER_BIT,C.NEAREST):Ye?C.copyTexSubImage3D(pe,ue,ge,ke,ct+je,Se,Pe,he,fe):C.copyTexSubImage2D(pe,ue,ge,ke,Se,Pe,he,fe);s.bindFramebuffer(C.READ_FRAMEBUFFER,null),s.bindFramebuffer(C.DRAW_FRAMEBUFFER,null)}else Ye?u.isDataTexture||u.isData3DTexture?C.texSubImage3D(pe,ue,ge,ke,ct,he,fe,_e,qe,ht,Je.data):R.isCompressedArrayTexture?C.compressedTexSubImage3D(pe,ue,ge,ke,ct,he,fe,_e,qe,Je.data):C.texSubImage3D(pe,ue,ge,ke,ct,he,fe,_e,qe,ht,Je):u.isDataTexture?C.texSubImage2D(C.TEXTURE_2D,ue,ge,ke,he,fe,qe,ht,Je.data):u.isCompressedTexture?C.compressedTexSubImage2D(C.TEXTURE_2D,ue,ge,ke,Je.width,Je.height,qe,Je.data):C.texSubImage2D(C.TEXTURE_2D,ue,ge,ke,he,fe,qe,ht,Je);s.pixelStorei(C.UNPACK_ROW_LENGTH,gt),s.pixelStorei(C.UNPACK_IMAGE_HEIGHT,Be),s.pixelStorei(C.UNPACK_SKIP_PIXELS,Mt),s.pixelStorei(C.UNPACK_SKIP_ROWS,Lt),s.pixelStorei(C.UNPACK_SKIP_IMAGES,Wt),ue===0&&R.generateMipmaps&&C.generateMipmap(pe),s.unbindTexture()},this.initRenderTarget=function(u){O.get(u).__webglFramebuffer===void 0&&H.setupRenderTarget(u)},this.initTexture=function(u){u.isCubeTexture?H.setTextureCube(u,0):u.isData3DTexture?H.setTexture3D(u,0):u.isDataArrayTexture||u.isCompressedArrayTexture?H.setTexture2DArray(u,0):H.setTexture2D(u,0),s.unbindTexture()},this.resetState=function(){j=0,Y=0,ne=null,s.reset(),de.reset()},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}get coordinateSystem(){return Di}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(n){this._outputColorSpace=n;const t=this.getContext();t.drawingBufferColorSpace=tt._getDrawingBufferColorSpace(n),t.unpackColorSpace=tt._getUnpackColorSpace()}}function lp(e,n=!1){const t=e[0].index!==null,i=new Set(Object.keys(e[0].attributes)),a=new Set(Object.keys(e[0].morphAttributes)),r={},o={},c=e[0].morphTargetsRelative,l=new en;let d=0;for(let _=0;_<e.length;++_){const g=e[_];let p=0;if(t!==(g.index!==null))return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+_+". All geometries must have compatible attributes; make sure index attribute exists among all geometries, or in none of them."),null;for(const v in g.attributes){if(!i.has(v))return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+_+'. All geometries must have compatible attributes; make sure "'+v+'" attribute exists among all geometries, or in none of them.'),null;r[v]===void 0&&(r[v]=[]),r[v].push(g.attributes[v]),p++}if(p!==i.size)return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+_+". Make sure all geometries have the same number of attributes."),null;if(c!==g.morphTargetsRelative)return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+_+". .morphTargetsRelative must be consistent throughout all geometries."),null;for(const v in g.morphAttributes){if(!a.has(v))return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+_+".  .morphAttributes must be consistent throughout all geometries."),null;o[v]===void 0&&(o[v]=[]),o[v].push(g.morphAttributes[v])}if(n){let v;if(t)v=g.index.count;else if(g.attributes.position!==void 0)v=g.attributes.position.count;else return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+_+". The geometry must have either an index or a position attribute"),null;l.addGroup(d,v,_),d+=v}}if(t){let _=0;const g=[];for(let p=0;p<e.length;++p){const v=e[p].index;for(let A=0;A<v.count;++A)g.push(v.getX(A)+_);_+=e[p].attributes.position.count}l.setIndex(g)}for(const _ in r){const g=zr(r[_]);if(!g)return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the "+_+" attribute."),null;l.setAttribute(_,g)}for(const _ in o){const g=o[_][0].length;if(g!==0){l.morphAttributes=l.morphAttributes||{},l.morphAttributes[_]=[];for(let p=0;p<g;++p){const v=[];for(let U=0;U<o[_].length;++U)v.push(o[_][U][p]);const A=zr(v);if(!A)return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the "+_+" morphAttribute."),null;l.morphAttributes[_].push(A)}}}return l}function zr(e){let n,t,i,a=-1,r=0;for(let d=0;d<e.length;++d){const _=e[d];if(n===void 0&&(n=_.array.constructor),n!==_.array.constructor)return console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.array must be of consistent array types across matching attributes."),null;if(t===void 0&&(t=_.itemSize),t!==_.itemSize)return console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.itemSize must be consistent across matching attributes."),null;if(i===void 0&&(i=_.normalized),i!==_.normalized)return console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.normalized must be consistent across matching attributes."),null;if(a===-1&&(a=_.gpuType),a!==_.gpuType)return console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.gpuType must be consistent across matching attributes."),null;r+=_.count*t}const o=new n(r),c=new Qt(o,t,i);let l=0;for(let d=0;d<e.length;++d){const _=e[d];if(_.isInterleavedBufferAttribute){const g=l/t;for(let p=0,v=_.count;p<v;p++)for(let A=0;A<t;A++){const U=_.getComponent(p,A);c.setComponent(p+g,A,U)}}else o.set(_.array,l);l+=_.count*t}return a!==void 0&&(c.gpuType=a),c}function Xr(e,n){if(n===rs)return console.warn("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Geometry already defined as triangles."),e;if(n===di||n===Sa){let t=e.getIndex();if(t===null){const r=[],o=e.getAttribute("position");if(o!==void 0){for(let c=0;c<o.count;c++)r.push(c);e.setIndex(r),t=e.getIndex()}else return console.error("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Undefined position attribute. Processing not possible."),e}const i=t.count-2,a=[];if(n===di)for(let r=1;r<=i;r++)a.push(t.getX(0)),a.push(t.getX(r)),a.push(t.getX(r+1));else for(let r=0;r<i;r++)r%2===0?(a.push(t.getX(r)),a.push(t.getX(r+1)),a.push(t.getX(r+2))):(a.push(t.getX(r+2)),a.push(t.getX(r+1)),a.push(t.getX(r)));return a.length/3!==i&&console.error("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unable to generate correct amount of triangles."),e.setIndex(a),e.clearGroups(),e}else return console.error("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unknown draw mode:",n),e}function Cd(e){const n=new Map,t=new Map,i=e.clone();return Ia(e,i,function(a,r){n.set(r,a),t.set(a,r)}),i.traverse(function(a){if(!a.isSkinnedMesh)return;const r=a,o=n.get(a),c=o.skeleton.bones;r.skeleton=o.skeleton.clone(),r.bindMatrix.copy(o.bindMatrix),r.skeleton.bones=c.map(function(l){return t.get(l)}),r.bind(r.skeleton,r.bindMatrix)}),i}function Ia(e,n,t){t(e,n);for(let i=0;i<e.children.length;i++)Ia(e.children[i],n.children[i],t)}class fp extends as{constructor(n){super(n),this.dracoLoader=null,this.ktx2Loader=null,this.meshoptDecoder=null,this.pluginCallbacks=[],this.register(function(t){return new Dd(t)}),this.register(function(t){return new Id(t)}),this.register(function(t){return new kd(t)}),this.register(function(t){return new Wd(t)}),this.register(function(t){return new zd(t)}),this.register(function(t){return new yd(t)}),this.register(function(t){return new Od(t)}),this.register(function(t){return new Fd(t)}),this.register(function(t){return new Bd(t)}),this.register(function(t){return new Ud(t)}),this.register(function(t){return new Gd(t)}),this.register(function(t){return new Nd(t)}),this.register(function(t){return new Vd(t)}),this.register(function(t){return new Hd(t)}),this.register(function(t){return new Pd(t)}),this.register(function(t){return new Kr(t,De.EXT_MESHOPT_COMPRESSION)}),this.register(function(t){return new Kr(t,De.KHR_MESHOPT_COMPRESSION)}),this.register(function(t){return new Xd(t)})}load(n,t,i,a){const r=this;let o;if(this.resourcePath!=="")o=this.resourcePath;else if(this.path!==""){const d=An.extractUrlBase(n);o=An.resolveURL(d,this.path)}else o=An.extractUrlBase(n);this.manager.itemStart(n);const c=function(d){a?a(d):console.error(d),r.manager.itemError(n),r.manager.itemEnd(n)},l=new Ea(this.manager);l.setPath(this.path),l.setResponseType("arraybuffer"),l.setRequestHeader(this.requestHeader),l.setWithCredentials(this.withCredentials),l.load(n,function(d){try{r.parse(d,o,function(_){t(_),r.manager.itemEnd(n)},c)}catch(_){c(_)}},i,c)}setDRACOLoader(n){return this.dracoLoader=n,this}setKTX2Loader(n){return this.ktx2Loader=n,this}setMeshoptDecoder(n){return this.meshoptDecoder=n,this}register(n){return this.pluginCallbacks.indexOf(n)===-1&&this.pluginCallbacks.push(n),this}unregister(n){return this.pluginCallbacks.indexOf(n)!==-1&&this.pluginCallbacks.splice(this.pluginCallbacks.indexOf(n),1),this}parse(n,t,i,a){let r;const o={},c={},l=new TextDecoder;if(typeof n=="string")r=JSON.parse(n);else if(n instanceof ArrayBuffer)if(l.decode(new Uint8Array(n,0,4))===Na){try{o[De.KHR_BINARY_GLTF]=new Kd(n)}catch(g){a&&a(g);return}r=JSON.parse(o[De.KHR_BINARY_GLTF].content)}else r=JSON.parse(l.decode(n));else r=n;if(r.asset===void 0||r.asset.version[0]<2){a&&a(new Error("THREE.GLTFLoader: Unsupported asset. glTF versions >=2.0 are supported."));return}const d=new ap(r,{path:t||this.resourcePath||"",crossOrigin:this.crossOrigin,requestHeader:this.requestHeader,manager:this.manager,ktx2Loader:this.ktx2Loader,meshoptDecoder:this.meshoptDecoder});d.fileLoader.setRequestHeader(this.requestHeader);for(let _=0;_<this.pluginCallbacks.length;_++){const g=this.pluginCallbacks[_](d);g.name||console.error("THREE.GLTFLoader: Invalid plugin found: missing name"),c[g.name]=g,o[g.name]=!0}if(r.extensionsUsed)for(let _=0;_<r.extensionsUsed.length;++_){const g=r.extensionsUsed[_],p=r.extensionsRequired||[];switch(g){case De.KHR_MATERIALS_UNLIT:o[g]=new wd;break;case De.KHR_DRACO_MESH_COMPRESSION:o[g]=new Yd(r,this.dracoLoader);break;case De.KHR_TEXTURE_TRANSFORM:o[g]=new qd;break;case De.KHR_MESH_QUANTIZATION:o[g]=new Zd;break;default:p.indexOf(g)>=0&&c[g]===void 0&&console.warn('THREE.GLTFLoader: Unknown extension "'+g+'".')}}d.setExtensions(o),d.setPlugins(c),d.parse(i,a)}parseAsync(n,t){const i=this;return new Promise(function(a,r){i.parse(n,t,a,r)})}}function Ld(){let e={};return{get:function(n){return e[n]},add:function(n,t){e[n]=t},remove:function(n){delete e[n]},removeAll:function(){e={}}}}function ot(e,n,t){const i=e.json.materials[n];return i.extensions&&i.extensions[t]?i.extensions[t]:null}const De={KHR_BINARY_GLTF:"KHR_binary_glTF",KHR_DRACO_MESH_COMPRESSION:"KHR_draco_mesh_compression",KHR_LIGHTS_PUNCTUAL:"KHR_lights_punctual",KHR_MATERIALS_CLEARCOAT:"KHR_materials_clearcoat",KHR_MATERIALS_DISPERSION:"KHR_materials_dispersion",KHR_MATERIALS_IOR:"KHR_materials_ior",KHR_MATERIALS_SHEEN:"KHR_materials_sheen",KHR_MATERIALS_SPECULAR:"KHR_materials_specular",KHR_MATERIALS_TRANSMISSION:"KHR_materials_transmission",KHR_MATERIALS_IRIDESCENCE:"KHR_materials_iridescence",KHR_MATERIALS_ANISOTROPY:"KHR_materials_anisotropy",KHR_MATERIALS_UNLIT:"KHR_materials_unlit",KHR_MATERIALS_VOLUME:"KHR_materials_volume",KHR_TEXTURE_BASISU:"KHR_texture_basisu",KHR_TEXTURE_TRANSFORM:"KHR_texture_transform",KHR_MESH_QUANTIZATION:"KHR_mesh_quantization",KHR_MATERIALS_EMISSIVE_STRENGTH:"KHR_materials_emissive_strength",EXT_MATERIALS_BUMP:"EXT_materials_bump",EXT_TEXTURE_WEBP:"EXT_texture_webp",EXT_TEXTURE_AVIF:"EXT_texture_avif",EXT_MESHOPT_COMPRESSION:"EXT_meshopt_compression",KHR_MESHOPT_COMPRESSION:"KHR_meshopt_compression",EXT_MESH_GPU_INSTANCING:"EXT_mesh_gpu_instancing"};class Pd{constructor(n){this.parser=n,this.name=De.KHR_LIGHTS_PUNCTUAL,this.cache={refs:{},uses:{}}}_markDefs(){const n=this.parser,t=this.parser.json.nodes||[];for(let i=0,a=t.length;i<a;i++){const r=t[i];r.extensions&&r.extensions[this.name]&&r.extensions[this.name].light!==void 0&&n._addNodeRef(this.cache,r.extensions[this.name].light)}}_loadLight(n){const t=this.parser,i="light:"+n;let a=t.cache.get(i);if(a)return a;const r=t.json,l=((r.extensions&&r.extensions[this.name]||{}).lights||[])[n];let d;const _=new He(16777215);l.color!==void 0&&_.setRGB(l.color[0],l.color[1],l.color[2],bt);const g=l.range!==void 0?l.range:0;switch(l.type){case"directional":d=new cs(_),d.target.position.set(0,0,-1),d.add(d.target);break;case"point":d=new ss(_),d.distance=g;break;case"spot":d=new os(_),d.distance=g,l.spot=l.spot||{},l.spot.innerConeAngle=l.spot.innerConeAngle!==void 0?l.spot.innerConeAngle:0,l.spot.outerConeAngle=l.spot.outerConeAngle!==void 0?l.spot.outerConeAngle:Math.PI/4,d.angle=l.spot.outerConeAngle,d.penumbra=1-l.spot.innerConeAngle/l.spot.outerConeAngle,d.target.position.set(0,0,-1),d.add(d.target);break;default:throw new Error("THREE.GLTFLoader: Unexpected light type: "+l.type)}return d.position.set(0,0,0),wt(d,l),l.intensity!==void 0&&(d.intensity=l.intensity),d.name=t.createUniqueName(l.name||"light_"+n),a=Promise.resolve(d),t.cache.add(i,a),a}getDependency(n,t){if(n==="light")return this._loadLight(t)}createNodeAttachment(n){const t=this,i=this.parser,r=i.json.nodes[n],c=(r.extensions&&r.extensions[this.name]||{}).light;return c===void 0?null:this._loadLight(c).then(function(l){return i._getNodeRef(t.cache,c,l)})}}class wd{constructor(){this.name=De.KHR_MATERIALS_UNLIT}getMaterialType(){return sn}extendParams(n,t,i){const a=[];n.color=new He(1,1,1),n.opacity=1;const r=t.pbrMetallicRoughness;if(r){if(Array.isArray(r.baseColorFactor)){const o=r.baseColorFactor;n.color.setRGB(o[0],o[1],o[2],bt),n.opacity=o[3]}r.baseColorTexture!==void 0&&a.push(i.assignTexture(n,"map",r.baseColorTexture,fn))}return Promise.all(a)}}class Ud{constructor(n){this.parser=n,this.name=De.KHR_MATERIALS_EMISSIVE_STRENGTH}extendMaterialParams(n,t){const i=ot(this.parser,n,this.name);return i===null||i.emissiveStrength!==void 0&&(t.emissiveIntensity=i.emissiveStrength),Promise.resolve()}}class Dd{constructor(n){this.parser=n,this.name=De.KHR_MATERIALS_CLEARCOAT}getMaterialType(n){return ot(this.parser,n,this.name)!==null?Ft:null}extendMaterialParams(n,t){const i=ot(this.parser,n,this.name);if(i===null)return Promise.resolve();const a=[];if(i.clearcoatFactor!==void 0&&(t.clearcoat=i.clearcoatFactor),i.clearcoatTexture!==void 0&&a.push(this.parser.assignTexture(t,"clearcoatMap",i.clearcoatTexture)),i.clearcoatRoughnessFactor!==void 0&&(t.clearcoatRoughness=i.clearcoatRoughnessFactor),i.clearcoatRoughnessTexture!==void 0&&a.push(this.parser.assignTexture(t,"clearcoatRoughnessMap",i.clearcoatRoughnessTexture)),i.clearcoatNormalTexture!==void 0&&(a.push(this.parser.assignTexture(t,"clearcoatNormalMap",i.clearcoatNormalTexture)),i.clearcoatNormalTexture.scale!==void 0)){const r=i.clearcoatNormalTexture.scale;t.clearcoatNormalScale=new _t(r,r)}return Promise.all(a)}}class Id{constructor(n){this.parser=n,this.name=De.KHR_MATERIALS_DISPERSION}getMaterialType(n){return ot(this.parser,n,this.name)!==null?Ft:null}extendMaterialParams(n,t){const i=ot(this.parser,n,this.name);return i===null||(t.dispersion=i.dispersion!==void 0?i.dispersion:0),Promise.resolve()}}class Nd{constructor(n){this.parser=n,this.name=De.KHR_MATERIALS_IRIDESCENCE}getMaterialType(n){return ot(this.parser,n,this.name)!==null?Ft:null}extendMaterialParams(n,t){const i=ot(this.parser,n,this.name);if(i===null)return Promise.resolve();const a=[];return i.iridescenceFactor!==void 0&&(t.iridescence=i.iridescenceFactor),i.iridescenceTexture!==void 0&&a.push(this.parser.assignTexture(t,"iridescenceMap",i.iridescenceTexture)),i.iridescenceIor!==void 0&&(t.iridescenceIOR=i.iridescenceIor),t.iridescenceThicknessRange===void 0&&(t.iridescenceThicknessRange=[100,400]),i.iridescenceThicknessMinimum!==void 0&&(t.iridescenceThicknessRange[0]=i.iridescenceThicknessMinimum),i.iridescenceThicknessMaximum!==void 0&&(t.iridescenceThicknessRange[1]=i.iridescenceThicknessMaximum),i.iridescenceThicknessTexture!==void 0&&a.push(this.parser.assignTexture(t,"iridescenceThicknessMap",i.iridescenceThicknessTexture)),Promise.all(a)}}class yd{constructor(n){this.parser=n,this.name=De.KHR_MATERIALS_SHEEN}getMaterialType(n){return ot(this.parser,n,this.name)!==null?Ft:null}extendMaterialParams(n,t){const i=ot(this.parser,n,this.name);if(i===null)return Promise.resolve();const a=[];if(t.sheenColor=new He(0,0,0),t.sheenRoughness=0,t.sheen=1,i.sheenColorFactor!==void 0){const r=i.sheenColorFactor;t.sheenColor.setRGB(r[0],r[1],r[2],bt)}return i.sheenRoughnessFactor!==void 0&&(t.sheenRoughness=i.sheenRoughnessFactor),i.sheenColorTexture!==void 0&&a.push(this.parser.assignTexture(t,"sheenColorMap",i.sheenColorTexture,fn)),i.sheenRoughnessTexture!==void 0&&a.push(this.parser.assignTexture(t,"sheenRoughnessMap",i.sheenRoughnessTexture)),Promise.all(a)}}class Od{constructor(n){this.parser=n,this.name=De.KHR_MATERIALS_TRANSMISSION}getMaterialType(n){return ot(this.parser,n,this.name)!==null?Ft:null}extendMaterialParams(n,t){const i=ot(this.parser,n,this.name);if(i===null)return Promise.resolve();const a=[];return i.transmissionFactor!==void 0&&(t.transmission=i.transmissionFactor),i.transmissionTexture!==void 0&&a.push(this.parser.assignTexture(t,"transmissionMap",i.transmissionTexture)),Promise.all(a)}}class Fd{constructor(n){this.parser=n,this.name=De.KHR_MATERIALS_VOLUME}getMaterialType(n){return ot(this.parser,n,this.name)!==null?Ft:null}extendMaterialParams(n,t){const i=ot(this.parser,n,this.name);if(i===null)return Promise.resolve();const a=[];t.thickness=i.thicknessFactor!==void 0?i.thicknessFactor:0,i.thicknessTexture!==void 0&&a.push(this.parser.assignTexture(t,"thicknessMap",i.thicknessTexture)),t.attenuationDistance=i.attenuationDistance||1/0;const r=i.attenuationColor||[1,1,1];return t.attenuationColor=new He().setRGB(r[0],r[1],r[2],bt),Promise.all(a)}}class Bd{constructor(n){this.parser=n,this.name=De.KHR_MATERIALS_IOR}getMaterialType(n){return ot(this.parser,n,this.name)!==null?Ft:null}extendMaterialParams(n,t){const i=ot(this.parser,n,this.name);return i===null||(t.ior=i.ior!==void 0?i.ior:1.5,t.ior===0&&(t.ior=1e3)),Promise.resolve()}}class Gd{constructor(n){this.parser=n,this.name=De.KHR_MATERIALS_SPECULAR}getMaterialType(n){return ot(this.parser,n,this.name)!==null?Ft:null}extendMaterialParams(n,t){const i=ot(this.parser,n,this.name);if(i===null)return Promise.resolve();const a=[];t.specularIntensity=i.specularFactor!==void 0?i.specularFactor:1,i.specularTexture!==void 0&&a.push(this.parser.assignTexture(t,"specularIntensityMap",i.specularTexture));const r=i.specularColorFactor||[1,1,1];return t.specularColor=new He().setRGB(r[0],r[1],r[2],bt),i.specularColorTexture!==void 0&&a.push(this.parser.assignTexture(t,"specularColorMap",i.specularColorTexture,fn)),Promise.all(a)}}class Hd{constructor(n){this.parser=n,this.name=De.EXT_MATERIALS_BUMP}getMaterialType(n){return ot(this.parser,n,this.name)!==null?Ft:null}extendMaterialParams(n,t){const i=ot(this.parser,n,this.name);if(i===null)return Promise.resolve();const a=[];return t.bumpScale=i.bumpFactor!==void 0?i.bumpFactor:1,i.bumpTexture!==void 0&&a.push(this.parser.assignTexture(t,"bumpMap",i.bumpTexture)),Promise.all(a)}}class Vd{constructor(n){this.parser=n,this.name=De.KHR_MATERIALS_ANISOTROPY}getMaterialType(n){return ot(this.parser,n,this.name)!==null?Ft:null}extendMaterialParams(n,t){const i=ot(this.parser,n,this.name);if(i===null)return Promise.resolve();const a=[];return i.anisotropyStrength!==void 0&&(t.anisotropy=i.anisotropyStrength),i.anisotropyRotation!==void 0&&(t.anisotropyRotation=i.anisotropyRotation),i.anisotropyTexture!==void 0&&a.push(this.parser.assignTexture(t,"anisotropyMap",i.anisotropyTexture)),Promise.all(a)}}class kd{constructor(n){this.parser=n,this.name=De.KHR_TEXTURE_BASISU}loadTexture(n){const t=this.parser,i=t.json,a=i.textures[n];if(!a.extensions||!a.extensions[this.name])return null;const r=a.extensions[this.name],o=t.options.ktx2Loader;if(!o){if(i.extensionsRequired&&i.extensionsRequired.indexOf(this.name)>=0)throw new Error("THREE.GLTFLoader: setKTX2Loader must be called before loading KTX2 textures");return null}return t.loadTextureImage(n,r.source,o)}}class Wd{constructor(n){this.parser=n,this.name=De.EXT_TEXTURE_WEBP}loadTexture(n){const t=this.name,i=this.parser,a=i.json,r=a.textures[n];if(!r.extensions||!r.extensions[t])return null;const o=r.extensions[t],c=a.images[o.source];let l=i.textureLoader;if(c.uri){const d=i.options.manager.getHandler(c.uri);d!==null&&(l=d)}return i.loadTextureImage(n,o.source,l)}}class zd{constructor(n){this.parser=n,this.name=De.EXT_TEXTURE_AVIF}loadTexture(n){const t=this.name,i=this.parser,a=i.json,r=a.textures[n];if(!r.extensions||!r.extensions[t])return null;const o=r.extensions[t],c=a.images[o.source];let l=i.textureLoader;if(c.uri){const d=i.options.manager.getHandler(c.uri);d!==null&&(l=d)}return i.loadTextureImage(n,o.source,l)}}class Kr{constructor(n,t){this.name=t,this.parser=n}loadBufferView(n){const t=this.parser.json,i=t.bufferViews[n];if(i.extensions&&i.extensions[this.name]){const a=i.extensions[this.name],r=this.parser.getDependency("buffer",a.buffer),o=this.parser.options.meshoptDecoder;if(!o||!o.supported){if(t.extensionsRequired&&t.extensionsRequired.indexOf(this.name)>=0)throw new Error("THREE.GLTFLoader: setMeshoptDecoder must be called before loading compressed files");return null}return r.then(function(c){const l=a.byteOffset||0,d=a.byteLength||0,_=a.count,g=a.byteStride,p=new Uint8Array(c,l,d);return o.decodeGltfBufferAsync?o.decodeGltfBufferAsync(_,g,p,a.mode,a.filter).then(function(v){return v.buffer}):o.ready.then(function(){const v=new ArrayBuffer(_*g);return o.decodeGltfBuffer(new Uint8Array(v),_,g,p,a.mode,a.filter),v})})}else return null}}class Xd{constructor(n){this.name=De.EXT_MESH_GPU_INSTANCING,this.parser=n}createNodeMesh(n){const t=this.parser.json,i=t.nodes[n];if(!i.extensions||!i.extensions[this.name]||i.mesh===void 0)return null;const a=t.meshes[i.mesh];for(const d of a.primitives)if(d.mode!==Tt.TRIANGLES&&d.mode!==Tt.TRIANGLE_STRIP&&d.mode!==Tt.TRIANGLE_FAN&&d.mode!==void 0)return null;const o=i.extensions[this.name].attributes,c=[],l={};for(const d in o)c.push(this.parser.getDependency("accessor",o[d]).then(_=>(l[d]=_,l[d])));return c.length<1?null:(c.push(this.parser.createNodeMesh(n)),Promise.all(c).then(d=>{const _=d.pop(),g=_.isGroup?_.children:[_],p=d[0].count,v=[];for(const A of g){const U=new yt,h=new Le,f=new xa,P=new Le(1,1,1),F=new ls(A.geometry,A.material,p);for(let M=0;M<p;M++)l.TRANSLATION&&h.fromBufferAttribute(l.TRANSLATION,M),l.ROTATION&&f.fromBufferAttribute(l.ROTATION,M),l.SCALE&&P.fromBufferAttribute(l.SCALE,M),F.setMatrixAt(M,U.compose(h,f,P));let E=null;for(const M in l)if(M==="_COLOR_0"){const x=l[M];F.instanceColor=new vr(x.array,x.itemSize,x.normalized)}else if(M!=="TRANSLATION"&&M!=="ROTATION"&&M!=="SCALE"){if(E===null){const L=F.geometry;E=new en,E.name=L.name;for(const m in L.attributes)E.setAttribute(m,L.attributes[m]);for(const m in L.morphAttributes)E.morphAttributes[m]=L.morphAttributes[m];L.index!==null&&E.setIndex(L.index),E.morphTargetsRelative=L.morphTargetsRelative;for(const m of L.groups)E.addGroup(m.start,m.count,m.materialIndex);L.boundingBox!==null&&(E.boundingBox=L.boundingBox.clone()),L.boundingSphere!==null&&(E.boundingSphere=L.boundingSphere.clone()),E.drawRange.start=L.drawRange.start,E.drawRange.count=L.drawRange.count,E.userData=Object.assign({},L.userData),F.geometry=E}const x=l[M];E.setAttribute(M,new vr(x.array,x.itemSize,x.normalized))}Ma.prototype.copy.call(F,A),this.parser.assignFinalMaterial(F),v.push(F)}return _.isGroup?(_.clear(),_.add(...v),_):v[0]}))}}const Na="glTF",Sn=12,Yr={JSON:1313821514,BIN:5130562};class Kd{constructor(n){this.name=De.KHR_BINARY_GLTF,this.content=null,this.body=null;const t=new DataView(n,0,Sn),i=new TextDecoder;if(this.header={magic:i.decode(new Uint8Array(n.slice(0,4))),version:t.getUint32(4,!0),length:t.getUint32(8,!0)},this.header.magic!==Na)throw new Error("THREE.GLTFLoader: Unsupported glTF-Binary header.");if(this.header.version<2)throw new Error("THREE.GLTFLoader: Legacy binary file detected.");const a=this.header.length-Sn,r=new DataView(n,Sn);let o=0;for(;o<a;){const c=r.getUint32(o,!0);o+=4;const l=r.getUint32(o,!0);if(o+=4,l===Yr.JSON){const d=new Uint8Array(n,Sn+o,c);this.content=i.decode(d)}else if(l===Yr.BIN){const d=Sn+o;this.body=n.slice(d,d+c)}o+=c}if(this.content===null)throw new Error("THREE.GLTFLoader: JSON content not found.")}}class Yd{constructor(n,t){if(!t)throw new Error("THREE.GLTFLoader: No DRACOLoader instance provided.");this.name=De.KHR_DRACO_MESH_COMPRESSION,this.json=n,this.dracoLoader=t,this.dracoLoader.preload()}decodePrimitive(n,t){const i=this.json,a=this.dracoLoader,r=n.extensions[this.name].bufferView,o=n.extensions[this.name].attributes,c={},l={},d={};for(const _ in o){const g=mi[_]||_.toLowerCase();c[g]=o[_]}for(const _ in n.attributes){const g=mi[_]||_.toLowerCase();if(o[_]!==void 0){const p=i.accessors[n.attributes[_]],v=ln[p.componentType];d[g]=v.name,l[g]=p.normalized===!0}}return t.getDependency("bufferView",r).then(function(_){return new Promise(function(g,p){a.decodeDracoFile(_,function(v){for(const A in v.attributes){const U=v.attributes[A],h=l[A];h!==void 0&&(U.normalized=h)}g(v)},c,d,bt,p)})})}}class qd{constructor(){this.name=De.KHR_TEXTURE_TRANSFORM}extendTexture(n,t){if((t.texCoord===void 0||t.texCoord===n.channel)&&t.offset===void 0&&t.rotation===void 0&&t.scale===void 0)return n;if(n=n.clone(),t.texCoord!==void 0&&(n.channel=t.texCoord),t.offset!==void 0&&n.offset.fromArray(t.offset),t.rotation!==void 0&&(n.rotation=t.rotation),t.scale!==void 0&&n.repeat.fromArray(t.scale),t.rotation!==void 0){const i=Math.cos(n.rotation),a=Math.sin(n.rotation);n.matrix.set(n.repeat.x*i,n.repeat.y*a,n.offset.x,-n.repeat.x*a,n.repeat.y*i,n.offset.y,0,0,1),n.matrixAutoUpdate=!1}return n.needsUpdate=!0,n}}class Zd{constructor(){this.name=De.KHR_MESH_QUANTIZATION}}class ya extends Cs{constructor(n,t,i,a){super(n,t,i,a)}copySampleValue_(n){const t=this.resultBuffer,i=this.sampleValues,a=this.valueSize,r=n*a*3+a;for(let o=0;o!==a;o++)t[o]=i[r+o];return t}interpolate_(n,t,i,a){const r=this.resultBuffer,o=this.sampleValues,c=this.valueSize,l=c*2,d=c*3,_=a-t,g=(i-t)/_,p=g*g,v=p*g,A=n*d,U=A-d,h=-2*v+3*p,f=v-p,P=1-h,F=f-p+g;for(let E=0;E!==c;E++){const M=o[U+E+c],x=o[U+E+l]*_,L=o[A+E+c],m=o[A+E]*_;r[E]=P*M+F*x+h*L+f*m}return r}}const $d=new xa;class jd extends ya{interpolate_(n,t,i,a){const r=super.interpolate_(n,t,i,a);return $d.fromArray(r).normalize().toArray(r),r}}const Tt={POINTS:0,LINES:1,LINE_LOOP:2,LINE_STRIP:3,TRIANGLES:4,TRIANGLE_STRIP:5,TRIANGLE_FAN:6},ln={5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array},qr={9728:Bt,9729:mt,9984:Jr,9985:Un,9986:En,9987:Yt},Zr={33071:yn,33648:Qr,10497:On},ai={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16},mi={POSITION:"position",NORMAL:"normal",TANGENT:"tangent",TEXCOORD_0:"uv",TEXCOORD_1:"uv1",TEXCOORD_2:"uv2",TEXCOORD_3:"uv3",COLOR_0:"color",WEIGHTS_0:"skinWeight",JOINTS_0:"skinIndex"},Kt={scale:"scale",translation:"position",rotation:"quaternion",weights:"morphTargetInfluences"},Qd={CUBICSPLINE:void 0,LINEAR:Aa,STEP:Rs},oi={OPAQUE:"OPAQUE",MASK:"MASK",BLEND:"BLEND"};function Jd(e){return e.DefaultMaterial===void 0&&(e.DefaultMaterial=new Ta({color:16777215,emissive:0,metalness:1,roughness:1,transparent:!1,depthTest:!0,side:un})),e.DefaultMaterial}function jt(e,n,t){for(const i in t.extensions)e[i]===void 0&&(n.userData.gltfExtensions=n.userData.gltfExtensions||{},n.userData.gltfExtensions[i]=t.extensions[i])}function wt(e,n){n.extras!==void 0&&(typeof n.extras=="object"?Object.assign(e.userData,n.extras):console.warn("THREE.GLTFLoader: Ignoring primitive type .extras, "+n.extras))}function ep(e,n,t){let i=!1,a=!1,r=!1;for(let d=0,_=n.length;d<_;d++){const g=n[d];if(g.POSITION!==void 0&&(i=!0),g.NORMAL!==void 0&&(a=!0),g.COLOR_0!==void 0&&(r=!0),i&&a&&r)break}if(!i&&!a&&!r)return Promise.resolve(e);const o=[],c=[],l=[];for(let d=0,_=n.length;d<_;d++){const g=n[d];if(i){const p=g.POSITION!==void 0?t.getDependency("accessor",g.POSITION):e.attributes.position;o.push(p)}if(a){const p=g.NORMAL!==void 0?t.getDependency("accessor",g.NORMAL):e.attributes.normal;c.push(p)}if(r){const p=g.COLOR_0!==void 0?t.getDependency("accessor",g.COLOR_0):e.attributes.color;l.push(p)}}return Promise.all([Promise.all(o),Promise.all(c),Promise.all(l)]).then(function(d){const _=d[0],g=d[1],p=d[2];return i&&(e.morphAttributes.position=_),a&&(e.morphAttributes.normal=g),r&&(e.morphAttributes.color=p),e.morphTargetsRelative=!0,e})}function tp(e,n){if(e.updateMorphTargets(),n.weights!==void 0)for(let t=0,i=n.weights.length;t<i;t++)e.morphTargetInfluences[t]=n.weights[t];if(n.extras&&Array.isArray(n.extras.targetNames)){const t=n.extras.targetNames;if(e.morphTargetInfluences.length===t.length){e.morphTargetDictionary={};for(let i=0,a=t.length;i<a;i++)e.morphTargetDictionary[t[i]]=i}else console.warn("THREE.GLTFLoader: Invalid extras.targetNames length. Ignoring names.")}}function np(e){let n;const t=e.extensions&&e.extensions[De.KHR_DRACO_MESH_COMPRESSION];if(t?n="draco:"+t.bufferView+":"+t.indices+":"+si(t.attributes):n=e.indices+":"+si(e.attributes)+":"+e.mode,e.targets!==void 0)for(let i=0,a=e.targets.length;i<a;i++)n+=":"+si(e.targets[i]);return n}function si(e){let n="";const t=Object.keys(e).sort();for(let i=0,a=t.length;i<a;i++)n+=t[i]+":"+e[t[i]]+";";return n}function _i(e){switch(e){case Int8Array:return 1/127;case Uint8Array:return 1/255;case Int16Array:return 1/32767;case Uint16Array:return 1/65535;default:throw new Error("THREE.GLTFLoader: Unsupported normalized accessor component type.")}}function ip(e){return e.search(/\.jpe?g($|\?)/i)>0||e.search(/^data\:image\/jpeg/)===0?"image/jpeg":e.search(/\.webp($|\?)/i)>0||e.search(/^data\:image\/webp/)===0?"image/webp":e.search(/\.ktx2($|\?)/i)>0||e.search(/^data\:image\/ktx2/)===0?"image/ktx2":"image/png"}const rp=new yt;class ap{constructor(n={},t={}){this.json=n,this.extensions={},this.plugins={},this.options=t,this.cache=new Ld,this.associations=new Map,this.primitiveCache={},this.nodeCache={},this.meshCache={refs:{},uses:{}},this.cameraCache={refs:{},uses:{}},this.lightCache={refs:{},uses:{}},this.sourceCache={},this.textureCache={},this.nodeNamesUsed={};let i=!1,a=-1,r=!1,o=-1;if(typeof navigator<"u"&&typeof navigator.userAgent<"u"){const c=navigator.userAgent;i=/^((?!chrome|android).)*safari/i.test(c)===!0;const l=c.match(/Version\/(\d+)/);a=i&&l?parseInt(l[1],10):-1,r=c.indexOf("Firefox")>-1,o=r?c.match(/Firefox\/([0-9]+)\./)[1]:-1}typeof createImageBitmap>"u"||i&&a<17||r&&o<98?this.textureLoader=new fs(this.options.manager):this.textureLoader=new us(this.options.manager),this.textureLoader.setCrossOrigin(this.options.crossOrigin),this.textureLoader.setRequestHeader(this.options.requestHeader),this.fileLoader=new Ea(this.options.manager),this.fileLoader.setResponseType("arraybuffer"),this.options.crossOrigin==="use-credentials"&&this.fileLoader.setWithCredentials(!0)}setExtensions(n){this.extensions=n}setPlugins(n){this.plugins=n}parse(n,t){const i=this,a=this.json,r=this.extensions;this.cache.removeAll(),this.nodeCache={},this._invokeAll(function(o){return o._markDefs&&o._markDefs()}),Promise.all(this._invokeAll(function(o){return o.beforeRoot&&o.beforeRoot()})).then(function(){return Promise.all([i.getDependencies("scene"),i.getDependencies("animation"),i.getDependencies("camera")])}).then(function(o){const c={scene:o[0][a.scene||0],scenes:o[0],animations:o[1],cameras:o[2],asset:a.asset,parser:i,userData:{}};return jt(r,c,a),wt(c,a),Promise.all(i._invokeAll(function(l){return l.afterRoot&&l.afterRoot(c)})).then(function(){for(const l of c.scenes)l.updateMatrixWorld();n(c)})}).catch(t)}_markDefs(){const n=this.json.nodes||[],t=this.json.skins||[],i=this.json.meshes||[];for(let a=0,r=t.length;a<r;a++){const o=t[a].joints;for(let c=0,l=o.length;c<l;c++)n[o[c]].isBone=!0}for(let a=0,r=n.length;a<r;a++){const o=n[a];o.mesh!==void 0&&(this._addNodeRef(this.meshCache,o.mesh),o.skin!==void 0&&(i[o.mesh].isSkinnedMesh=!0)),o.camera!==void 0&&this._addNodeRef(this.cameraCache,o.camera)}}_addNodeRef(n,t){t!==void 0&&(n.refs[t]===void 0&&(n.refs[t]=n.uses[t]=0),n.refs[t]++)}_getNodeRef(n,t,i){if(n.refs[t]<=1)return i;const a=i.clone(),r=(o,c)=>{const l=this.associations.get(o);l!=null&&this.associations.set(c,l);for(const[d,_]of o.children.entries())r(_,c.children[d])};return r(i,a),a.name+="_instance_"+n.uses[t]++,a}_invokeOne(n){const t=Object.values(this.plugins);t.push(this);for(let i=0;i<t.length;i++){const a=n(t[i]);if(a)return a}return null}_invokeAll(n){const t=Object.values(this.plugins);t.unshift(this);const i=[];for(let a=0;a<t.length;a++){const r=n(t[a]);r&&i.push(r)}return i}getDependency(n,t){const i=n+":"+t;let a=this.cache.get(i);if(!a){switch(n){case"scene":a=this.loadScene(t);break;case"node":a=this._invokeOne(function(r){return r.loadNode&&r.loadNode(t)});break;case"mesh":a=this._invokeOne(function(r){return r.loadMesh&&r.loadMesh(t)});break;case"accessor":a=this.loadAccessor(t);break;case"bufferView":a=this._invokeOne(function(r){return r.loadBufferView&&r.loadBufferView(t)});break;case"buffer":a=this.loadBuffer(t);break;case"material":a=this._invokeOne(function(r){return r.loadMaterial&&r.loadMaterial(t)});break;case"texture":a=this._invokeOne(function(r){return r.loadTexture&&r.loadTexture(t)});break;case"skin":a=this.loadSkin(t);break;case"animation":a=this._invokeOne(function(r){return r.loadAnimation&&r.loadAnimation(t)});break;case"camera":a=this.loadCamera(t);break;default:if(a=this._invokeOne(function(r){return r!=this&&r.getDependency&&r.getDependency(n,t)}),!a)throw new Error("Unknown type: "+n);break}this.cache.add(i,a)}return a}getDependencies(n){let t=this.cache.get(n);if(!t){const i=this,a=this.json[n+(n==="mesh"?"es":"s")]||[];t=Promise.all(a.map(function(r,o){return i.getDependency(n,o)})),this.cache.add(n,t)}return t}loadBuffer(n){const t=this.json.buffers[n],i=this.fileLoader;if(t.type&&t.type!=="arraybuffer")throw new Error("THREE.GLTFLoader: "+t.type+" buffer type is not supported.");if(t.uri===void 0&&n===0)return Promise.resolve(this.extensions[De.KHR_BINARY_GLTF].body);const a=this.options;return new Promise(function(r,o){i.load(An.resolveURL(t.uri,a.path),r,void 0,function(){o(new Error('THREE.GLTFLoader: Failed to load buffer "'+t.uri+'".'))})})}loadBufferView(n){const t=this.json.bufferViews[n];return this.getDependency("buffer",t.buffer).then(function(i){const a=t.byteLength||0,r=t.byteOffset||0;return i.slice(r,r+a)})}loadAccessor(n){const t=this,i=this.json,a=this.json.accessors[n];if(a.bufferView===void 0&&a.sparse===void 0){const o=ai[a.type],c=ln[a.componentType],l=a.normalized===!0,d=new c(a.count*o);return Promise.resolve(new Qt(d,o,l))}const r=[];return a.bufferView!==void 0?r.push(this.getDependency("bufferView",a.bufferView)):r.push(null),a.sparse!==void 0&&(r.push(this.getDependency("bufferView",a.sparse.indices.bufferView)),r.push(this.getDependency("bufferView",a.sparse.values.bufferView))),Promise.all(r).then(function(o){const c=o[0],l=ai[a.type],d=ln[a.componentType],_=d.BYTES_PER_ELEMENT,g=_*l,p=a.byteOffset||0,v=a.bufferView!==void 0?i.bufferViews[a.bufferView].byteStride:void 0,A=a.normalized===!0;let U,h;if(v&&v!==g){const f=Math.floor(p/v),P="InterleavedBuffer:"+a.bufferView+":"+a.componentType+":"+f+":"+a.count;let F=t.cache.get(P);F||(U=new d(c,f*v,a.count*v/_),F=new ds(U,v/_),t.cache.add(P,F)),h=new bs(F,l,p%v/_,A)}else c===null?U=new d(a.count*l):U=new d(c,p,a.count*l),h=new Qt(U,l,A);if(a.sparse!==void 0){const f=ai.SCALAR,P=ln[a.sparse.indices.componentType],F=a.sparse.indices.byteOffset||0,E=a.sparse.values.byteOffset||0,M=new P(o[1],F,a.sparse.count*f),x=new d(o[2],E,a.sparse.count*l);c!==null&&(h=new Qt(h.array.slice(),h.itemSize,h.normalized)),h.normalized=!1;for(let L=0,m=M.length;L<m;L++){const T=M[L];if(h.setX(T,x[L*l]),l>=2&&h.setY(T,x[L*l+1]),l>=3&&h.setZ(T,x[L*l+2]),l>=4&&h.setW(T,x[L*l+3]),l>=5)throw new Error("THREE.GLTFLoader: Unsupported itemSize in sparse BufferAttribute.")}h.normalized=A}return h})}loadTexture(n){const t=this.json,i=this.options,r=t.textures[n].source,o=t.images[r];let c=this.textureLoader;if(o.uri){const l=i.manager.getHandler(o.uri);l!==null&&(c=l)}return this.loadTextureImage(n,r,c)}loadTextureImage(n,t,i){const a=this,r=this.json,o=r.textures[n],c=r.images[t],l=(c.uri||c.bufferView)+":"+o.sampler;if(this.textureCache[l])return this.textureCache[l];const d=this.loadImageSource(t,i).then(function(_){_.flipY=!1,_.name=o.name||c.name||"",_.name===""&&typeof c.uri=="string"&&c.uri.startsWith("data:image/")===!1&&(_.name=c.uri);const p=(r.samplers||{})[o.sampler]||{};return _.magFilter=qr[p.magFilter]||mt,_.minFilter=qr[p.minFilter]||Yt,_.wrapS=Zr[p.wrapS]||On,_.wrapT=Zr[p.wrapT]||On,_.generateMipmaps=!_.isCompressedTexture&&_.minFilter!==Bt&&_.minFilter!==mt,a.associations.set(_,{textures:n}),_}).catch(function(){return null});return this.textureCache[l]=d,d}loadImageSource(n,t){const i=this,a=this.json,r=this.options;if(this.sourceCache[n]!==void 0)return this.sourceCache[n].then(g=>g.clone());const o=a.images[n],c=self.URL||self.webkitURL;let l=o.uri||"",d=!1;if(o.bufferView!==void 0)l=i.getDependency("bufferView",o.bufferView).then(function(g){d=!0;const p=new Blob([g],{type:o.mimeType});return l=c.createObjectURL(p),l});else if(o.uri===void 0)throw new Error("THREE.GLTFLoader: Image "+n+" is missing URI and bufferView");const _=Promise.resolve(l).then(function(g){return new Promise(function(p,v){let A=p;t.isImageBitmapLoader===!0&&(A=function(U){const h=new ui(U);h.needsUpdate=!0,p(h)}),t.load(An.resolveURL(g,r.path),A,void 0,v)})}).then(function(g){return d===!0&&c.revokeObjectURL(l),wt(g,o),g.userData.mimeType=o.mimeType||ip(o.uri),g}).catch(function(g){throw console.error("THREE.GLTFLoader: Couldn't load texture",l),g});return this.sourceCache[n]=_,_}assignTexture(n,t,i,a){const r=this;return this.getDependency("texture",i.index).then(function(o){if(!o)return null;if(i.texCoord!==void 0&&i.texCoord>0&&(o=o.clone(),o.channel=i.texCoord),r.extensions[De.KHR_TEXTURE_TRANSFORM]){const c=i.extensions!==void 0?i.extensions[De.KHR_TEXTURE_TRANSFORM]:void 0;if(c){const l=r.associations.get(o);o=r.extensions[De.KHR_TEXTURE_TRANSFORM].extendTexture(o,c),r.associations.set(o,l)}}return a!==void 0&&(o.colorSpace=a),n[t]=o,o})}assignFinalMaterial(n){const t=n.geometry;let i=n.material;const a=t.attributes.tangent===void 0,r=t.attributes.color!==void 0,o=t.attributes.normal===void 0;if(n.isPoints){const c="PointsMaterial:"+i.uuid;let l=this.cache.get(c);l||(l=new ps,jn.prototype.copy.call(l,i),l.color.copy(i.color),l.map=i.map,l.sizeAttenuation=!1,this.cache.add(c,l)),i=l}else if(n.isLine){const c="LineBasicMaterial:"+i.uuid;let l=this.cache.get(c);l||(l=new hs,jn.prototype.copy.call(l,i),l.color.copy(i.color),l.map=i.map,this.cache.add(c,l)),i=l}if(a||r||o){let c="ClonedMaterial:"+i.uuid+":";a&&(c+="derivative-tangents:"),r&&(c+="vertex-colors:"),o&&(c+="flat-shading:");let l=this.cache.get(c);l||(l=i.clone(),r&&(l.vertexColors=!0),o&&(l.flatShading=!0),a&&(l.normalScale&&(l.normalScale.y*=-1),l.clearcoatNormalScale&&(l.clearcoatNormalScale.y*=-1)),this.cache.add(c,l),this.associations.set(l,this.associations.get(i))),i=l}n.material=i}getMaterialType(){return Ta}loadMaterial(n){const t=this,i=this.json,a=this.extensions,r=i.materials[n];let o;const c={},l=r.extensions||{},d=[];if(l[De.KHR_MATERIALS_UNLIT]){const g=a[De.KHR_MATERIALS_UNLIT];o=g.getMaterialType(),d.push(g.extendParams(c,r,t))}else{const g=r.pbrMetallicRoughness||{};if(c.color=new He(1,1,1),c.opacity=1,Array.isArray(g.baseColorFactor)){const p=g.baseColorFactor;c.color.setRGB(p[0],p[1],p[2],bt),c.opacity=p[3]}g.baseColorTexture!==void 0&&d.push(t.assignTexture(c,"map",g.baseColorTexture,fn)),c.metalness=g.metallicFactor!==void 0?g.metallicFactor:1,c.roughness=g.roughnessFactor!==void 0?g.roughnessFactor:1,g.metallicRoughnessTexture!==void 0&&(d.push(t.assignTexture(c,"metalnessMap",g.metallicRoughnessTexture)),d.push(t.assignTexture(c,"roughnessMap",g.metallicRoughnessTexture))),o=this._invokeOne(function(p){return p.getMaterialType&&p.getMaterialType(n)}),d.push(Promise.all(this._invokeAll(function(p){return p.extendMaterialParams&&p.extendMaterialParams(n,c)})))}r.doubleSided===!0&&(c.side=It);const _=r.alphaMode||oi.OPAQUE;if(_===oi.BLEND?(c.transparent=!0,c.depthWrite=!1):(c.transparent=!1,_===oi.MASK&&(c.alphaTest=r.alphaCutoff!==void 0?r.alphaCutoff:.5)),r.normalTexture!==void 0&&o!==sn&&(d.push(t.assignTexture(c,"normalMap",r.normalTexture)),c.normalScale=new _t(1,1),r.normalTexture.scale!==void 0)){const g=r.normalTexture.scale;c.normalScale.set(g,g)}if(r.occlusionTexture!==void 0&&o!==sn&&(d.push(t.assignTexture(c,"aoMap",r.occlusionTexture)),r.occlusionTexture.strength!==void 0&&(c.aoMapIntensity=r.occlusionTexture.strength)),r.emissiveFactor!==void 0&&o!==sn){const g=r.emissiveFactor;c.emissive=new He().setRGB(g[0],g[1],g[2],bt)}return r.emissiveTexture!==void 0&&o!==sn&&d.push(t.assignTexture(c,"emissiveMap",r.emissiveTexture,fn)),Promise.all(d).then(function(){const g=new o(c);return r.name&&(g.name=r.name),wt(g,r),t.associations.set(g,{materials:n}),r.extensions&&jt(a,g,r),g})}createUniqueName(n){const t=ms.sanitizeNodeName(n||"");return t in this.nodeNamesUsed?t+"_"+ ++this.nodeNamesUsed[t]:(this.nodeNamesUsed[t]=0,t)}loadGeometries(n){const t=this,i=this.extensions,a=this.primitiveCache;function r(c){return i[De.KHR_DRACO_MESH_COMPRESSION].decodePrimitive(c,t).then(function(l){return $r(l,c,t)})}const o=[];for(let c=0,l=n.length;c<l;c++){const d=n[c],_=np(d),g=a[_];if(g)o.push(g.promise);else{let p;d.extensions&&d.extensions[De.KHR_DRACO_MESH_COMPRESSION]?p=r(d):p=$r(new en,d,t),d.mode===Tt.TRIANGLE_STRIP?p=p.then(v=>Xr(v,Sa)):d.mode===Tt.TRIANGLE_FAN&&(p=p.then(v=>Xr(v,di))),a[_]={primitive:d,promise:p},o.push(p)}}return Promise.all(o)}loadMesh(n){const t=this,i=this.json,a=this.extensions,r=i.meshes[n],o=r.primitives,c=[];for(let l=0,d=o.length;l<d;l++){const _=o[l].material===void 0?Jd(this.cache):this.getDependency("material",o[l].material);c.push(_)}return c.push(t.loadGeometries(o)),Promise.all(c).then(async function(l){const d=l.slice(0,l.length-1),_=l[l.length-1],g=[];for(let v=0,A=_.length;v<A;v++){const U=_[v],h=o[v];let f;const P=d[v];if(h.mode===Tt.TRIANGLES||h.mode===Tt.TRIANGLE_STRIP||h.mode===Tt.TRIANGLE_FAN||h.mode===void 0){const F=r.isSkinnedMesh===!0,E=U.hasAttribute("skinIndex")&&U.hasAttribute("skinWeight");F&&E===!1&&console.warn("THREE.GLTFLoader: Missing skinIndex or skinWeight attributes. Skinning disabled."),f=F&&E?new _s(U,P):new Ot(U,P),f.isSkinnedMesh===!0&&f.normalizeSkinWeights()}else if(h.mode===Tt.LINES)f=new gs(U,P);else if(h.mode===Tt.LINE_STRIP)f=new vs(U,P);else if(h.mode===Tt.LINE_LOOP)f=new Ss(U,P);else if(h.mode===Tt.POINTS)f=new Es(U,P);else throw new Error("THREE.GLTFLoader: Primitive mode unsupported: "+h.mode);Object.keys(f.geometry.morphAttributes).length>0&&tp(f,r),f.name=t.createUniqueName(r.name||"mesh_"+n),wt(f,r),h.extensions&&jt(a,f,h),t.assignFinalMaterial(f),g.push(f)}for(let v=0,A=g.length;v<A;v++)t.associations.set(g[v],{meshes:n,primitives:v});if(g.length===1)return r.extensions&&jt(a,g[0],r),g[0];const p=new Qn;r.extensions&&jt(a,p,r),t.associations.set(p,{meshes:n});for(let v=0,A=g.length;v<A;v++)p.add(g[v]);return p})}loadCamera(n){let t;const i=this.json.cameras[n],a=i[i.type];if(!a){console.warn("THREE.GLTFLoader: Missing camera parameters.");return}return i.type==="perspective"?t=new Tn(xs.radToDeg(a.yfov),a.aspectRatio||1,a.znear||1,a.zfar||2e6):i.type==="orthographic"&&(t=new Si(-a.xmag,a.xmag,a.ymag,-a.ymag,a.znear,a.zfar)),i.name&&(t.name=this.createUniqueName(i.name)),wt(t,i),Promise.resolve(t)}loadSkin(n){const t=this.json.skins[n],i=[];for(let a=0,r=t.joints.length;a<r;a++)i.push(this._loadNodeShallow(t.joints[a]));return t.inverseBindMatrices!==void 0?i.push(this.getDependency("accessor",t.inverseBindMatrices)):i.push(null),Promise.all(i).then(function(a){const r=a.pop(),o=a,c=[],l=[];for(let d=0,_=o.length;d<_;d++){const g=o[d];if(g){c.push(g);const p=new yt;r!==null&&p.fromArray(r.array,d*16),l.push(p)}else console.warn('THREE.GLTFLoader: Joint "%s" could not be found.',t.joints[d])}return new Ms(c,l)})}loadAnimation(n){const t=this.json,i=this,a=t.animations[n],r=a.name?a.name:"animation_"+n,o=[],c=[],l=[],d=[],_=[];for(let g=0,p=a.channels.length;g<p;g++){const v=a.channels[g],A=a.samplers[v.sampler],U=v.target,h=U.node,f=a.parameters!==void 0?a.parameters[A.input]:A.input,P=a.parameters!==void 0?a.parameters[A.output]:A.output;U.node!==void 0&&(o.push(this.getDependency("node",h)),c.push(this.getDependency("accessor",f)),l.push(this.getDependency("accessor",P)),d.push(A),_.push(U))}return Promise.all([Promise.all(o),Promise.all(c),Promise.all(l),Promise.all(d),Promise.all(_)]).then(function(g){const p=g[0],v=g[1],A=g[2],U=g[3],h=g[4],f=[];for(let F=0,E=p.length;F<E;F++){const M=p[F],x=v[F],L=A[F],m=U[F],T=h[F];if(M===void 0)continue;M.updateMatrix&&M.updateMatrix();const y=i._createAnimationTracks(M,x,L,m,T);if(y)for(let G=0;G<y.length;G++)f.push(y[G])}const P=new Ts(r,void 0,f);return wt(P,a),P})}createNodeMesh(n){const t=this.json,i=this,a=t.nodes[n];return a.mesh===void 0?null:i.getDependency("mesh",a.mesh).then(function(r){const o=i._getNodeRef(i.meshCache,a.mesh,r);return a.weights!==void 0&&o.traverse(function(c){if(c.isMesh)for(let l=0,d=a.weights.length;l<d;l++)c.morphTargetInfluences[l]=a.weights[l]}),o})}loadNode(n){const t=this.json,i=this,a=t.nodes[n],r=i._loadNodeShallow(n),o=[],c=a.children||[];for(let d=0,_=c.length;d<_;d++)o.push(i.getDependency("node",c[d]));const l=a.skin===void 0?Promise.resolve(null):i.getDependency("skin",a.skin);return Promise.all([r,Promise.all(o),l]).then(function(d){const _=d[0],g=d[1],p=d[2];p!==null&&_.traverse(function(v){v.isSkinnedMesh&&v.bind(p,rp)});for(let v=0,A=g.length;v<A;v++)_.add(g[v]);if(_.userData.pivot!==void 0&&g.length>0){const v=_.userData.pivot,A=g[0];_.pivot=new Le().fromArray(v),_.position.x-=v[0],_.position.y-=v[1],_.position.z-=v[2],A.position.set(0,0,0),delete _.userData.pivot}return _})}_loadNodeShallow(n){const t=this.json,i=this.extensions,a=this;if(this.nodeCache[n]!==void 0)return this.nodeCache[n];const r=t.nodes[n],o=r.name?a.createUniqueName(r.name):"",c=[],l=a._invokeOne(function(d){return d.createNodeMesh&&d.createNodeMesh(n)});return l&&c.push(l),r.camera!==void 0&&c.push(a.getDependency("camera",r.camera).then(function(d){return a._getNodeRef(a.cameraCache,r.camera,d)})),a._invokeAll(function(d){return d.createNodeAttachment&&d.createNodeAttachment(n)}).forEach(function(d){c.push(d)}),this.nodeCache[n]=Promise.all(c).then(function(d){let _;if(r.isBone===!0?_=new As:d.length>1?_=new Qn:d.length===1?_=d[0]:_=new Ma,_!==d[0])for(let g=0,p=d.length;g<p;g++)_.add(d[g]);if(r.name&&(_.userData.name=r.name,_.name=o),wt(_,r),r.extensions&&jt(i,_,r),r.matrix!==void 0){const g=new yt;g.fromArray(r.matrix),_.applyMatrix4(g)}else r.translation!==void 0&&_.position.fromArray(r.translation),r.rotation!==void 0&&_.quaternion.fromArray(r.rotation),r.scale!==void 0&&_.scale.fromArray(r.scale);if(!a.associations.has(_))a.associations.set(_,{});else if(r.mesh!==void 0&&a.meshCache.refs[r.mesh]>1){const g=a.associations.get(_);a.associations.set(_,{...g})}return a.associations.get(_).nodes=n,_}),this.nodeCache[n]}loadScene(n){const t=this.extensions,i=this.json.scenes[n],a=this,r=new Qn;i.name&&(r.name=a.createUniqueName(i.name)),wt(r,i),i.extensions&&jt(t,r,i);const o=i.nodes||[],c=[];for(let l=0,d=o.length;l<d;l++)c.push(a.getDependency("node",o[l]));return Promise.all(c).then(function(l){for(let _=0,g=l.length;_<g;_++){const p=l[_];p.parent!==null?r.add(Cd(p)):r.add(p)}const d=_=>{const g=new Map;for(const[p,v]of a.associations)(p instanceof jn||p instanceof ui)&&g.set(p,v);return _.traverse(p=>{const v=a.associations.get(p);v!=null&&g.set(p,v)}),g};return a.associations=d(r),r})}_createAnimationTracks(n,t,i,a,r){const o=[],c=n.name?n.name:n.uuid,l=[];function d(v){v.morphTargetInfluences&&l.push(v.name?v.name:v.uuid)}Kt[r.path]===Kt.weights?(d(n),n.isGroup&&n.children.forEach(d)):l.push(c);let _;switch(Kt[r.path]){case Kt.weights:_=Er;break;case Kt.rotation:_=xr;break;case Kt.translation:case Kt.scale:_=Sr;break;default:i.itemSize===1?_=Er:_=Sr;break}const g=a.interpolation!==void 0?Qd[a.interpolation]:Aa,p=this._getArrayFromAccessor(i);for(let v=0,A=l.length;v<A;v++){const U=new _(l[v]+"."+Kt[r.path],t.array,p,g);a.interpolation==="CUBICSPLINE"&&this._createCubicSplineTrackInterpolant(U),o.push(U)}return o}_getArrayFromAccessor(n){let t=n.array;if(n.normalized){const i=_i(t.constructor),a=new Float32Array(t.length);for(let r=0,o=t.length;r<o;r++)a[r]=t[r]*i;t=a}return t}_createCubicSplineTrackInterpolant(n){n.createInterpolant=function(i){const a=this instanceof xr?jd:ya;return new a(this.times,this.values,this.getValueSize()/3,i)},n.createInterpolant.isInterpolantFactoryMethodGLTFCubicSpline=!0}}function op(e,n,t){const i=n.attributes,a=new Ls;if(i.POSITION!==void 0){const c=t.json.accessors[i.POSITION],l=c.min,d=c.max;if(l!==void 0&&d!==void 0){if(a.set(new Le(l[0],l[1],l[2]),new Le(d[0],d[1],d[2])),c.normalized){const _=_i(ln[c.componentType]);a.min.multiplyScalar(_),a.max.multiplyScalar(_)}}else{console.warn("THREE.GLTFLoader: Missing min/max properties for accessor POSITION.");return}}else return;const r=n.targets;if(r!==void 0){const c=new Le,l=new Le;for(let d=0,_=r.length;d<_;d++){const g=r[d];if(g.POSITION!==void 0){const p=t.json.accessors[g.POSITION],v=p.min,A=p.max;if(v!==void 0&&A!==void 0){if(l.setX(Math.max(Math.abs(v[0]),Math.abs(A[0]))),l.setY(Math.max(Math.abs(v[1]),Math.abs(A[1]))),l.setZ(Math.max(Math.abs(v[2]),Math.abs(A[2]))),p.normalized){const U=_i(ln[p.componentType]);l.multiplyScalar(U)}c.max(l)}else console.warn("THREE.GLTFLoader: Missing min/max properties for accessor POSITION.")}}a.expandByVector(c)}e.boundingBox=a;const o=new Ps;a.getCenter(o.center),o.radius=a.min.distanceTo(a.max)/2,e.boundingSphere=o}function $r(e,n,t){const i=n.attributes,a=[];function r(o,c){return t.getDependency("accessor",o).then(function(l){e.setAttribute(c,l)})}for(const o in i){const c=mi[o]||o.toLowerCase();c in e.attributes||a.push(r(i[o],c))}if(n.indices!==void 0&&!e.index){const o=t.getDependency("accessor",n.indices).then(function(c){e.setIndex(c)});a.push(o)}return tt.workingColorSpace!==bt&&"COLOR_0"in i&&console.warn(`THREE.GLTFLoader: Converting vertex colors from "srgb-linear" to "${tt.workingColorSpace}" not supported.`),wt(e,n),op(e,n,t),Promise.all(a).then(function(){return n.targets!==void 0?ep(e,n.targets,t):e})}export{fp as G,cp as W,lp as m};
