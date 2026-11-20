(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const i of document.querySelectorAll('link[rel="modulepreload"]'))n(i);new MutationObserver(i=>{for(const r of i)if(r.type==="childList")for(const a of r.addedNodes)a.tagName==="LINK"&&a.rel==="modulepreload"&&n(a)}).observe(document,{childList:!0,subtree:!0});function e(i){const r={};return i.integrity&&(r.integrity=i.integrity),i.referrerPolicy&&(r.referrerPolicy=i.referrerPolicy),i.crossOrigin==="use-credentials"?r.credentials="include":i.crossOrigin==="anonymous"?r.credentials="omit":r.credentials="same-origin",r}function n(i){if(i.ep)return;i.ep=!0;const r=e(i);fetch(i.href,r)}})();const Bl="186",gg={LEFT:0,MIDDLE:1,RIGHT:2,ROTATE:0,DOLLY:1,PAN:2},_g={ROTATE:0,PAN:1,DOLLY_PAN:2,DOLLY_ROTATE:3},Hf=0,yh=1,Wf=2,xg=3,yg=0,ea=1,Vh=2,sr=3,Ii=0,nn=1,Xn=2,oi=0,cr=1,vh=2,Mh=3,Sh=4,Xf=5,vg=6,xs=100,qf=101,Yf=102,Zf=103,$f=104,Jf=200,Kf=201,Qf=202,jf=203,Gh=204,Hh=205,tp=206,ep=207,np=208,ip=209,sp=210,rp=211,ap=212,op=213,lp=214,Xo=0,qo=1,Yo=2,fr=3,Zo=4,$o=5,Jo=6,Ko=7,Da=0,cp=1,hp=2,Yn=0,Wh=1,Xh=2,qh=3,zl=4,Yh=5,Zh=6,$h=7,bh="attached",up="detached",kl=300,li=301,$i=302,na=303,ia=304,br=306,pa=1e3,yn=1001,ma=1002,Be=1003,Jh=1004,Mg=1004,rr=1005,Sg=1005,Ae=1006,sa=1007,bg=1007,ri=1008,wg=1008,_n=1009,Kh=1010,Qh=1011,pr=1012,Vl=1013,Un=1014,un=1015,Zn=1016,Gl=1017,Hl=1018,mr=1020,jh=35902,tu=35899,eu=1021,nu=1022,dn=1023,ci=1026,Xi=1027,Wl=1028,Na=1029,Ji=1030,Xl=1031,Ag=1032,ql=1033,ra=33776,aa=33777,oa=33778,la=33779,Qo=35840,jo=35841,tl=35842,el=35843,nl=36196,il=37492,sl=37496,rl=37488,al=37489,ga=37490,ol=37491,ll=37808,cl=37809,hl=37810,ul=37811,dl=37812,fl=37813,pl=37814,ml=37815,gl=37816,_l=37817,xl=37818,yl=37819,vl=37820,Ml=37821,Sl=36492,bl=36494,wl=36495,Al=36283,Tl=36284,_a=36285,El=36286,dp=2200,fp=2201,pp=2202,xa=2300,Cl=2301,Vo=2302,wh=2303,ys=2400,vs=2401,ya=2402,Yl=2500,iu=2501,Tg=0,Eg=1,Cg=2,mp=3200,Rg=3201,Ig=3202,Pg=3203,Pi=0,gp=1,Si="",cn="srgb",va="srgb-linear",Ma="linear",me="srgb",Lg="",Dg="rg",Ng="ga",Ug=0,Go=7680,Fg=7681,Og=7682,Bg=7683,zg=34055,kg=34056,Vg=5386,Gg=512,Hg=513,Wg=514,Xg=515,qg=516,Yg=517,Zg=518,_p=519,xp=512,yp=513,vp=514,Zl=515,Mp=516,Sp=517,$l=518,bp=519,Jl=35044,$g=35048,Jg=35040,Kg=35045,Qg=35049,jg=35041,t0=35046,e0=35050,n0=35042,i0="100",Ah="300 es",En=2e3,As=2001,s0={COMPUTE:"compute",RENDER:"render"},r0={PERSPECTIVE:"perspective",LINEAR:"linear",FLAT:"flat"},a0={NORMAL:"normal",CENTROID:"centroid",SAMPLE:"sample",FIRST:"first",EITHER:"either"},o0={TEXTURE_COMPARE:"depthTextureCompare"},l0={NONE:0,SHARED:1,FULL:2};function c0(s){for(let t=s.length-1;t>=0;--t)if(s[t]>=65535)return!0;return!1}const h0={Int8Array,Uint8Array,Uint8ClampedArray,Int16Array,Uint16Array,Int32Array,Uint32Array,Float32Array,Float64Array};function ar(s,t){return new h0[s](t)}function wp(s){return ArrayBuffer.isView(s)&&!(s instanceof DataView)}function Sa(s){return document.createElementNS("http://www.w3.org/1999/xhtml",s)}function Ap(){const s=Sa("canvas");return s.style.display="block",s}const id={};let Ki=null;function u0(s){Ki=s}function d0(){return Ki}function ba(...s){const t="THREE."+s.shift();Ki?Ki("log",t,...s):console.log(t,...s)}function Tp(s){const t=s[0];if(typeof t=="string"&&t.startsWith("TSL:")){const e=s[1];e&&e.isStackTrace?s[0]+=" "+e.getLocation():s[1]='Stack trace not available. Enable "THREE.Node.captureStackTrace" to capture stack traces.'}return s}function pt(...s){s=Tp(s);const t="THREE."+s.shift();if(Ki)Ki("warn",t,...s);else{const e=s[0];e&&e.isStackTrace?console.warn(e.getError(t)):console.warn(t,...s)}}function Nt(...s){s=Tp(s);const t="THREE."+s.shift();if(Ki)Ki("error",t,...s);else{const e=s[0];e&&e.isStackTrace?console.error(e.getError(t)):console.error(t,...s)}}function Ci(...s){const t=s.join(" ");t in id||(id[t]=!0,pt(...s))}function f0(s,t,e){return new Promise(function(n,i){function r(){switch(s.clientWaitSync(t,s.SYNC_FLUSH_COMMANDS_BIT,0)){case s.WAIT_FAILED:i();break;case s.TIMEOUT_EXPIRED:setTimeout(r,e);break;default:n()}}setTimeout(r,e)})}const p0={[Xo]:qo,[Yo]:Jo,[Zo]:Ko,[fr]:$o,[qo]:Xo,[Jo]:Yo,[Ko]:Zo,[$o]:fr};class Jn{addEventListener(t,e){this._listeners===void 0&&(this._listeners={});const n=this._listeners;n[t]===void 0&&(n[t]=[]),n[t].indexOf(e)===-1&&n[t].push(e)}hasEventListener(t,e){const n=this._listeners;return n===void 0?!1:n[t]!==void 0&&n[t].indexOf(e)!==-1}removeEventListener(t,e){const n=this._listeners;if(n===void 0)return;const i=n[t];if(i!==void 0){const r=i.indexOf(e);r!==-1&&i.splice(r,1)}}dispatchEvent(t){const e=this._listeners;if(e===void 0)return;const n=e[t.type];if(n!==void 0){t.target=this;const i=n.slice(0);for(let r=0,a=i.length;r<a;r++)i[r].call(this,t);t.target=null}}}const Je=["00","01","02","03","04","05","06","07","08","09","0a","0b","0c","0d","0e","0f","10","11","12","13","14","15","16","17","18","19","1a","1b","1c","1d","1e","1f","20","21","22","23","24","25","26","27","28","29","2a","2b","2c","2d","2e","2f","30","31","32","33","34","35","36","37","38","39","3a","3b","3c","3d","3e","3f","40","41","42","43","44","45","46","47","48","49","4a","4b","4c","4d","4e","4f","50","51","52","53","54","55","56","57","58","59","5a","5b","5c","5d","5e","5f","60","61","62","63","64","65","66","67","68","69","6a","6b","6c","6d","6e","6f","70","71","72","73","74","75","76","77","78","79","7a","7b","7c","7d","7e","7f","80","81","82","83","84","85","86","87","88","89","8a","8b","8c","8d","8e","8f","90","91","92","93","94","95","96","97","98","99","9a","9b","9c","9d","9e","9f","a0","a1","a2","a3","a4","a5","a6","a7","a8","a9","aa","ab","ac","ad","ae","af","b0","b1","b2","b3","b4","b5","b6","b7","b8","b9","ba","bb","bc","bd","be","bf","c0","c1","c2","c3","c4","c5","c6","c7","c8","c9","ca","cb","cc","cd","ce","cf","d0","d1","d2","d3","d4","d5","d6","d7","d8","d9","da","db","dc","dd","de","df","e0","e1","e2","e3","e4","e5","e6","e7","e8","e9","ea","eb","ec","ed","ee","ef","f0","f1","f2","f3","f4","f5","f6","f7","f8","f9","fa","fb","fc","fd","fe","ff"];let sd=1234567;const Ss=Math.PI/180,gr=180/Math.PI;function Cn(){const s=Math.random()*4294967295|0,t=Math.random()*4294967295|0,e=Math.random()*4294967295|0,n=Math.random()*4294967295|0;return(Je[s&255]+Je[s>>8&255]+Je[s>>16&255]+Je[s>>24&255]+"-"+Je[t&255]+Je[t>>8&255]+"-"+Je[t>>16&15|64]+Je[t>>24&255]+"-"+Je[e&63|128]+Je[e>>8&255]+"-"+Je[e>>16&255]+Je[e>>24&255]+Je[n&255]+Je[n>>8&255]+Je[n>>16&255]+Je[n>>24&255]).toLowerCase()}function Ht(s,t,e){return Math.max(t,Math.min(e,s))}function su(s,t){return(s%t+t)%t}function m0(s,t,e,n,i){return n+(s-t)*(i-n)/(e-t)}function g0(s,t,e){return s!==t?(e-s)/(t-s):0}function ca(s,t,e){return(1-e)*s+e*t}function _0(s,t,e,n){return ca(s,t,1-Math.exp(-e*n))}function x0(s,t=1){return t-Math.abs(su(s,t*2)-t)}function y0(s,t,e){return s<=t?0:s>=e?1:(s=(s-t)/(e-t),s*s*(3-2*s))}function v0(s,t,e){return s<=t?0:s>=e?1:(s=(s-t)/(e-t),s*s*s*(s*(s*6-15)+10))}function M0(s,t){return s+Math.floor(Math.random()*(t-s+1))}function S0(s,t){return s+Math.random()*(t-s)}function b0(s){return s*(.5-Math.random())}function w0(s){s!==void 0&&(sd=s);let t=sd+=1831565813;return t=Math.imul(t^t>>>15,t|1),t^=t+Math.imul(t^t>>>7,t|61),((t^t>>>14)>>>0)/4294967296}function A0(s){return s*Ss}function T0(s){return s*gr}function E0(s){return s>0&&Number.isInteger(s)&&2**Math.round(Math.log2(s))===s}function C0(s){return Math.pow(2,Math.ceil(Math.log(s)/Math.LN2))}function R0(s){return Math.pow(2,Math.floor(Math.log(s)/Math.LN2))}function I0(s,t,e,n,i){const r=Math.cos,a=Math.sin,o=r(e/2),l=a(e/2),c=r((t+n)/2),h=a((t+n)/2),f=r((t-n)/2),u=a((t-n)/2),d=r((n-t)/2),p=a((n-t)/2);switch(i){case"XYX":s.set(o*h,l*f,l*u,o*c);break;case"YZY":s.set(l*u,o*h,l*f,o*c);break;case"ZXZ":s.set(l*f,l*u,o*h,o*c);break;case"XZX":s.set(o*h,l*p,l*d,o*c);break;case"YXY":s.set(l*d,o*h,l*p,o*c);break;case"ZYZ":s.set(l*p,l*d,o*h,o*c);break;default:pt("MathUtils: .setQuaternionFromProperEuler() encountered an unknown order: "+i)}}function hn(s,t){switch(t.constructor){case Float32Array:return s;case Uint32Array:return s/4294967295;case Uint16Array:return s/65535;case Uint8Array:case Uint8ClampedArray:return s/255;case Int32Array:return Math.max(s/2147483647,-1);case Int16Array:return Math.max(s/32767,-1);case Int8Array:return Math.max(s/127,-1);default:throw new Error("THREE.MathUtils: Invalid component type.")}}function te(s,t){switch(t.constructor){case Float32Array:return s;case Uint32Array:return Math.round(s*4294967295);case Uint16Array:return Math.round(s*65535);case Uint8Array:case Uint8ClampedArray:return Math.round(s*255);case Int32Array:return Math.round(s*2147483647);case Int16Array:return Math.round(s*32767);case Int8Array:return Math.round(s*127);default:throw new Error("THREE.MathUtils: Invalid component type.")}}const An={DEG2RAD:Ss,RAD2DEG:gr,generateUUID:Cn,clamp:Ht,euclideanModulo:su,mapLinear:m0,inverseLerp:g0,lerp:ca,damp:_0,pingpong:x0,smoothstep:y0,smootherstep:v0,randInt:M0,randFloat:S0,randFloatSpread:b0,seededRandom:w0,degToRad:A0,radToDeg:T0,isPowerOfTwo:E0,ceilPowerOfTwo:C0,floorPowerOfTwo:R0,setQuaternionFromProperEuler:I0,normalize:te,denormalize:hn},Gu=class Gu{constructor(t=0,e=0){this.x=t,this.y=e}get width(){return this.x}set width(t){this.x=t}get height(){return this.y}set height(t){this.y=t}set(t,e){return this.x=t,this.y=e,this}setScalar(t){return this.x=t,this.y=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setComponent(t,e){switch(t){case 0:this.x=e;break;case 1:this.y=e;break;default:throw new Error("THREE.Vector2: index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;default:throw new Error("THREE.Vector2: index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y)}copy(t){return this.x=t.x,this.y=t.y,this}add(t){return this.x+=t.x,this.y+=t.y,this}addScalar(t){return this.x+=t,this.y+=t,this}addVectors(t,e){return this.x=t.x+e.x,this.y=t.y+e.y,this}addScaledVector(t,e){return this.x+=t.x*e,this.y+=t.y*e,this}sub(t){return this.x-=t.x,this.y-=t.y,this}subScalar(t){return this.x-=t,this.y-=t,this}subVectors(t,e){return this.x=t.x-e.x,this.y=t.y-e.y,this}multiply(t){return this.x*=t.x,this.y*=t.y,this}multiplyScalar(t){return this.x*=t,this.y*=t,this}divide(t){return this.x/=t.x,this.y/=t.y,this}divideScalar(t){return this.multiplyScalar(1/t)}applyMatrix3(t){const e=this.x,n=this.y,i=t.elements;return this.x=i[0]*e+i[3]*n+i[6],this.y=i[1]*e+i[4]*n+i[7],this}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this}clamp(t,e){return this.x=Ht(this.x,t.x,e.x),this.y=Ht(this.y,t.y,e.y),this}clampScalar(t,e){return this.x=Ht(this.x,t,e),this.y=Ht(this.y,t,e),this}clampLength(t,e){const n=this.length();return this.divideScalar(n||1).multiplyScalar(Ht(n,t,e))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this}negate(){return this.x=-this.x,this.y=-this.y,this}dot(t){return this.x*t.x+this.y*t.y}cross(t){return this.x*t.y-this.y*t.x}lengthSq(){return this.x*this.x+this.y*this.y}length(){return Math.sqrt(this.x*this.x+this.y*this.y)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)}normalize(){return this.divideScalar(this.length()||1)}angle(){return Math.atan2(-this.y,-this.x)+Math.PI}angleTo(t){const e=Math.sqrt(this.lengthSq()*t.lengthSq());if(e===0)return Math.PI/2;const n=this.dot(t)/e;return Math.acos(Ht(n,-1,1))}distanceTo(t){return Math.sqrt(this.distanceToSquared(t))}distanceToSquared(t){const e=this.x-t.x,n=this.y-t.y;return e*e+n*n}manhattanDistanceTo(t){return Math.abs(this.x-t.x)+Math.abs(this.y-t.y)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,e){return this.x+=(t.x-this.x)*e,this.y+=(t.y-this.y)*e,this}lerpVectors(t,e,n){return this.x=t.x+(e.x-t.x)*n,this.y=t.y+(e.y-t.y)*n,this}equals(t){return t.x===this.x&&t.y===this.y}fromArray(t,e=0){return this.x=t[e],this.y=t[e+1],this}toArray(t=[],e=0){return t[e]=this.x,t[e+1]=this.y,t}fromBufferAttribute(t,e){return this.x=t.getX(e),this.y=t.getY(e),this}rotateAround(t,e){const n=Math.cos(e),i=Math.sin(e),r=this.x-t.x,a=this.y-t.y;return this.x=r*n-a*i+t.x,this.y=r*i+a*n+t.y,this}random(){return this.x=Math.random(),this.y=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y}};Gu.prototype.isVector2=!0;let it=Gu;class sn{constructor(t=0,e=0,n=0,i=1){this.isQuaternion=!0,this._x=t,this._y=e,this._z=n,this._w=i}static slerpFlat(t,e,n,i,r,a,o){let l=n[i+0],c=n[i+1],h=n[i+2],f=n[i+3],u=r[a+0],d=r[a+1],p=r[a+2],_=r[a+3];if(f!==_||l!==u||c!==d||h!==p){let g=l*u+c*d+h*p+f*_;g<0&&(u=-u,d=-d,p=-p,_=-_,g=-g);let m=1-o;if(g<.9995){const x=Math.acos(g),M=Math.sin(x);m=Math.sin(m*x)/M,o=Math.sin(o*x)/M,l=l*m+u*o,c=c*m+d*o,h=h*m+p*o,f=f*m+_*o}else{l=l*m+u*o,c=c*m+d*o,h=h*m+p*o,f=f*m+_*o;const x=1/Math.sqrt(l*l+c*c+h*h+f*f);l*=x,c*=x,h*=x,f*=x}}t[e]=l,t[e+1]=c,t[e+2]=h,t[e+3]=f}static multiplyQuaternionsFlat(t,e,n,i,r,a){const o=n[i],l=n[i+1],c=n[i+2],h=n[i+3],f=r[a],u=r[a+1],d=r[a+2],p=r[a+3];return t[e]=o*p+h*f+l*d-c*u,t[e+1]=l*p+h*u+c*f-o*d,t[e+2]=c*p+h*d+o*u-l*f,t[e+3]=h*p-o*f-l*u-c*d,t}get x(){return this._x}set x(t){this._x=t,this._onChangeCallback()}get y(){return this._y}set y(t){this._y=t,this._onChangeCallback()}get z(){return this._z}set z(t){this._z=t,this._onChangeCallback()}get w(){return this._w}set w(t){this._w=t,this._onChangeCallback()}set(t,e,n,i){return this._x=t,this._y=e,this._z=n,this._w=i,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._w)}copy(t){return this._x=t.x,this._y=t.y,this._z=t.z,this._w=t.w,this._onChangeCallback(),this}setFromEuler(t,e=!0){const n=t._x,i=t._y,r=t._z,a=t._order,o=Math.cos,l=Math.sin,c=o(n/2),h=o(i/2),f=o(r/2),u=l(n/2),d=l(i/2),p=l(r/2);switch(a){case"XYZ":this._x=u*h*f+c*d*p,this._y=c*d*f-u*h*p,this._z=c*h*p+u*d*f,this._w=c*h*f-u*d*p;break;case"YXZ":this._x=u*h*f+c*d*p,this._y=c*d*f-u*h*p,this._z=c*h*p-u*d*f,this._w=c*h*f+u*d*p;break;case"ZXY":this._x=u*h*f-c*d*p,this._y=c*d*f+u*h*p,this._z=c*h*p+u*d*f,this._w=c*h*f-u*d*p;break;case"ZYX":this._x=u*h*f-c*d*p,this._y=c*d*f+u*h*p,this._z=c*h*p-u*d*f,this._w=c*h*f+u*d*p;break;case"YZX":this._x=u*h*f+c*d*p,this._y=c*d*f+u*h*p,this._z=c*h*p-u*d*f,this._w=c*h*f-u*d*p;break;case"XZY":this._x=u*h*f-c*d*p,this._y=c*d*f-u*h*p,this._z=c*h*p+u*d*f,this._w=c*h*f+u*d*p;break;default:pt("Quaternion: .setFromEuler() encountered an unknown order: "+a)}return e===!0&&this._onChangeCallback(),this}setFromAxisAngle(t,e){const n=e/2,i=Math.sin(n);return this._x=t.x*i,this._y=t.y*i,this._z=t.z*i,this._w=Math.cos(n),this._onChangeCallback(),this}setFromRotationMatrix(t){const e=t.elements,n=e[0],i=e[4],r=e[8],a=e[1],o=e[5],l=e[9],c=e[2],h=e[6],f=e[10],u=n+o+f;if(u>0){const d=.5/Math.sqrt(u+1);this._w=.25/d,this._x=(h-l)*d,this._y=(r-c)*d,this._z=(a-i)*d}else if(n>o&&n>f){const d=2*Math.sqrt(1+n-o-f);this._w=(h-l)/d,this._x=.25*d,this._y=(i+a)/d,this._z=(r+c)/d}else if(o>f){const d=2*Math.sqrt(1+o-n-f);this._w=(r-c)/d,this._x=(i+a)/d,this._y=.25*d,this._z=(l+h)/d}else{const d=2*Math.sqrt(1+f-n-o);this._w=(a-i)/d,this._x=(r+c)/d,this._y=(l+h)/d,this._z=.25*d}return this._onChangeCallback(),this}setFromUnitVectors(t,e){let n=t.dot(e)+1;return n<1e-8?(n=0,Math.abs(t.x)>Math.abs(t.z)?(this._x=-t.y,this._y=t.x,this._z=0,this._w=n):(this._x=0,this._y=-t.z,this._z=t.y,this._w=n)):(this._x=t.y*e.z-t.z*e.y,this._y=t.z*e.x-t.x*e.z,this._z=t.x*e.y-t.y*e.x,this._w=n),this.normalize()}angleTo(t){return 2*Math.acos(Math.abs(Ht(this.dot(t),-1,1)))}rotateTowards(t,e){const n=this.angleTo(t);if(n===0)return this;const i=Math.min(1,e/n);return this.slerp(t,i),this}identity(){return this.set(0,0,0,1)}invert(){return this.conjugate()}conjugate(){return this._x*=-1,this._y*=-1,this._z*=-1,this._onChangeCallback(),this}dot(t){return this._x*t._x+this._y*t._y+this._z*t._z+this._w*t._w}lengthSq(){return this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w}length(){return Math.sqrt(this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w)}normalize(){let t=this.length();return t===0?(this._x=0,this._y=0,this._z=0,this._w=1):(t=1/t,this._x=this._x*t,this._y=this._y*t,this._z=this._z*t,this._w=this._w*t),this._onChangeCallback(),this}multiply(t){return this.multiplyQuaternions(this,t)}premultiply(t){return this.multiplyQuaternions(t,this)}multiplyQuaternions(t,e){const n=t._x,i=t._y,r=t._z,a=t._w,o=e._x,l=e._y,c=e._z,h=e._w;return this._x=n*h+a*o+i*c-r*l,this._y=i*h+a*l+r*o-n*c,this._z=r*h+a*c+n*l-i*o,this._w=a*h-n*o-i*l-r*c,this._onChangeCallback(),this}slerp(t,e){let n=t._x,i=t._y,r=t._z,a=t._w,o=this.dot(t);o<0&&(n=-n,i=-i,r=-r,a=-a,o=-o);let l=1-e;if(o<.9995){const c=Math.acos(o),h=Math.sin(c);l=Math.sin(l*c)/h,e=Math.sin(e*c)/h,this._x=this._x*l+n*e,this._y=this._y*l+i*e,this._z=this._z*l+r*e,this._w=this._w*l+a*e,this._onChangeCallback()}else this._x=this._x*l+n*e,this._y=this._y*l+i*e,this._z=this._z*l+r*e,this._w=this._w*l+a*e,this.normalize();return this}slerpQuaternions(t,e,n){return this.copy(t).slerp(e,n)}random(){const t=2*Math.PI*Math.random(),e=2*Math.PI*Math.random(),n=Math.random(),i=Math.sqrt(1-n),r=Math.sqrt(n);return this.set(i*Math.sin(t),i*Math.cos(t),r*Math.sin(e),r*Math.cos(e))}equals(t){return t._x===this._x&&t._y===this._y&&t._z===this._z&&t._w===this._w}fromArray(t,e=0){return this._x=t[e],this._y=t[e+1],this._z=t[e+2],this._w=t[e+3],this._onChangeCallback(),this}toArray(t=[],e=0){return t[e]=this._x,t[e+1]=this._y,t[e+2]=this._z,t[e+3]=this._w,t}fromBufferAttribute(t,e){return this._x=t.getX(e),this._y=t.getY(e),this._z=t.getZ(e),this._w=t.getW(e),this._onChangeCallback(),this}toJSON(){return this.toArray()}_onChange(t){return this._onChangeCallback=t,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._w}}const Hu=class Hu{constructor(t=0,e=0,n=0){this.x=t,this.y=e,this.z=n}set(t,e,n){return n===void 0&&(n=this.z),this.x=t,this.y=e,this.z=n,this}setScalar(t){return this.x=t,this.y=t,this.z=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setZ(t){return this.z=t,this}setComponent(t,e){switch(t){case 0:this.x=e;break;case 1:this.y=e;break;case 2:this.z=e;break;default:throw new Error("THREE.Vector3: index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;case 2:return this.z;default:throw new Error("THREE.Vector3: index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y,this.z)}copy(t){return this.x=t.x,this.y=t.y,this.z=t.z,this}add(t){return this.x+=t.x,this.y+=t.y,this.z+=t.z,this}addScalar(t){return this.x+=t,this.y+=t,this.z+=t,this}addVectors(t,e){return this.x=t.x+e.x,this.y=t.y+e.y,this.z=t.z+e.z,this}addScaledVector(t,e){return this.x+=t.x*e,this.y+=t.y*e,this.z+=t.z*e,this}sub(t){return this.x-=t.x,this.y-=t.y,this.z-=t.z,this}subScalar(t){return this.x-=t,this.y-=t,this.z-=t,this}subVectors(t,e){return this.x=t.x-e.x,this.y=t.y-e.y,this.z=t.z-e.z,this}multiply(t){return this.x*=t.x,this.y*=t.y,this.z*=t.z,this}multiplyScalar(t){return this.x*=t,this.y*=t,this.z*=t,this}multiplyVectors(t,e){return this.x=t.x*e.x,this.y=t.y*e.y,this.z=t.z*e.z,this}applyEuler(t){return this.applyQuaternion(rd.setFromEuler(t))}applyAxisAngle(t,e){return this.applyQuaternion(rd.setFromAxisAngle(t,e))}applyMatrix3(t){const e=this.x,n=this.y,i=this.z,r=t.elements;return this.x=r[0]*e+r[3]*n+r[6]*i,this.y=r[1]*e+r[4]*n+r[7]*i,this.z=r[2]*e+r[5]*n+r[8]*i,this}applyNormalMatrix(t){return this.applyMatrix3(t).normalize()}applyMatrix4(t){const e=this.x,n=this.y,i=this.z,r=t.elements,a=1/(r[3]*e+r[7]*n+r[11]*i+r[15]);return this.x=(r[0]*e+r[4]*n+r[8]*i+r[12])*a,this.y=(r[1]*e+r[5]*n+r[9]*i+r[13])*a,this.z=(r[2]*e+r[6]*n+r[10]*i+r[14])*a,this}applyQuaternion(t){const e=this.x,n=this.y,i=this.z,r=t.x,a=t.y,o=t.z,l=t.w,c=2*(a*i-o*n),h=2*(o*e-r*i),f=2*(r*n-a*e);return this.x=e+l*c+a*f-o*h,this.y=n+l*h+o*c-r*f,this.z=i+l*f+r*h-a*c,this}project(t){return this.applyMatrix4(t.matrixWorldInverse).applyMatrix4(t.projectionMatrix)}unproject(t){return this.applyMatrix4(t.projectionMatrixInverse).applyMatrix4(t.matrixWorld)}transformDirection(t){const e=this.x,n=this.y,i=this.z,r=t.elements;return this.x=r[0]*e+r[4]*n+r[8]*i,this.y=r[1]*e+r[5]*n+r[9]*i,this.z=r[2]*e+r[6]*n+r[10]*i,this.normalize()}divide(t){return this.x/=t.x,this.y/=t.y,this.z/=t.z,this}divideScalar(t){return this.multiplyScalar(1/t)}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this.z=Math.min(this.z,t.z),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this.z=Math.max(this.z,t.z),this}clamp(t,e){return this.x=Ht(this.x,t.x,e.x),this.y=Ht(this.y,t.y,e.y),this.z=Ht(this.z,t.z,e.z),this}clampScalar(t,e){return this.x=Ht(this.x,t,e),this.y=Ht(this.y,t,e),this.z=Ht(this.z,t,e),this}clampLength(t,e){const n=this.length();return this.divideScalar(n||1).multiplyScalar(Ht(n,t,e))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this}dot(t){return this.x*t.x+this.y*t.y+this.z*t.z}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)}normalize(){return this.divideScalar(this.length()||1)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,e){return this.x+=(t.x-this.x)*e,this.y+=(t.y-this.y)*e,this.z+=(t.z-this.z)*e,this}lerpVectors(t,e,n){return this.x=t.x+(e.x-t.x)*n,this.y=t.y+(e.y-t.y)*n,this.z=t.z+(e.z-t.z)*n,this}cross(t){return this.crossVectors(this,t)}crossVectors(t,e){const n=t.x,i=t.y,r=t.z,a=e.x,o=e.y,l=e.z;return this.x=i*l-r*o,this.y=r*a-n*l,this.z=n*o-i*a,this}projectOnVector(t){const e=t.lengthSq();if(e===0)return this.set(0,0,0);const n=t.dot(this)/e;return this.copy(t).multiplyScalar(n)}projectOnPlane(t){return Ic.copy(this).projectOnVector(t),this.sub(Ic)}reflect(t){return this.sub(Ic.copy(t).multiplyScalar(2*this.dot(t)))}angleTo(t){const e=Math.sqrt(this.lengthSq()*t.lengthSq());if(e===0)return Math.PI/2;const n=this.dot(t)/e;return Math.acos(Ht(n,-1,1))}distanceTo(t){return Math.sqrt(this.distanceToSquared(t))}distanceToSquared(t){const e=this.x-t.x,n=this.y-t.y,i=this.z-t.z;return e*e+n*n+i*i}manhattanDistanceTo(t){return Math.abs(this.x-t.x)+Math.abs(this.y-t.y)+Math.abs(this.z-t.z)}setFromSpherical(t){return this.setFromSphericalCoords(t.radius,t.phi,t.theta)}setFromSphericalCoords(t,e,n){const i=Math.sin(e)*t;return this.x=i*Math.sin(n),this.y=Math.cos(e)*t,this.z=i*Math.cos(n),this}setFromCylindrical(t){return this.setFromCylindricalCoords(t.radius,t.theta,t.y)}setFromCylindricalCoords(t,e,n){return this.x=t*Math.sin(e),this.y=n,this.z=t*Math.cos(e),this}setFromMatrixPosition(t){const e=t.elements;return this.x=e[12],this.y=e[13],this.z=e[14],this}setFromMatrixScale(t){const e=this.setFromMatrixColumn(t,0).length(),n=this.setFromMatrixColumn(t,1).length(),i=this.setFromMatrixColumn(t,2).length();return this.x=e,this.y=n,this.z=i,this}setFromMatrixColumn(t,e){return this.fromArray(t.elements,e*4)}setFromMatrix3Column(t,e){return this.fromArray(t.elements,e*3)}setFromEuler(t){return this.x=t._x,this.y=t._y,this.z=t._z,this}setFromColor(t){return this.x=t.r,this.y=t.g,this.z=t.b,this}equals(t){return t.x===this.x&&t.y===this.y&&t.z===this.z}fromArray(t,e=0){return this.x=t[e],this.y=t[e+1],this.z=t[e+2],this}toArray(t=[],e=0){return t[e]=this.x,t[e+1]=this.y,t[e+2]=this.z,t}fromBufferAttribute(t,e){return this.x=t.getX(e),this.y=t.getY(e),this.z=t.getZ(e),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this}randomDirection(){const t=Math.random()*Math.PI*2,e=Math.random()*2-1,n=Math.sqrt(1-e*e);return this.x=n*Math.cos(t),this.y=e,this.z=n*Math.sin(t),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z}};Hu.prototype.isVector3=!0;let I=Hu;const Ic=new I,rd=new sn,Wu=class Wu{constructor(t,e,n,i,r,a,o,l,c){this.elements=[1,0,0,0,1,0,0,0,1],t!==void 0&&this.set(t,e,n,i,r,a,o,l,c)}set(t,e,n,i,r,a,o,l,c){const h=this.elements;return h[0]=t,h[1]=i,h[2]=o,h[3]=e,h[4]=r,h[5]=l,h[6]=n,h[7]=a,h[8]=c,this}identity(){return this.set(1,0,0,0,1,0,0,0,1),this}copy(t){const e=this.elements,n=t.elements;return e[0]=n[0],e[1]=n[1],e[2]=n[2],e[3]=n[3],e[4]=n[4],e[5]=n[5],e[6]=n[6],e[7]=n[7],e[8]=n[8],this}extractBasis(t,e,n){return t.setFromMatrix3Column(this,0),e.setFromMatrix3Column(this,1),n.setFromMatrix3Column(this,2),this}setFromMatrix4(t){const e=t.elements;return this.set(e[0],e[4],e[8],e[1],e[5],e[9],e[2],e[6],e[10]),this}multiply(t){return this.multiplyMatrices(this,t)}premultiply(t){return this.multiplyMatrices(t,this)}multiplyMatrices(t,e){const n=t.elements,i=e.elements,r=this.elements,a=n[0],o=n[3],l=n[6],c=n[1],h=n[4],f=n[7],u=n[2],d=n[5],p=n[8],_=i[0],g=i[3],m=i[6],x=i[1],M=i[4],y=i[7],w=i[2],b=i[5],E=i[8];return r[0]=a*_+o*x+l*w,r[3]=a*g+o*M+l*b,r[6]=a*m+o*y+l*E,r[1]=c*_+h*x+f*w,r[4]=c*g+h*M+f*b,r[7]=c*m+h*y+f*E,r[2]=u*_+d*x+p*w,r[5]=u*g+d*M+p*b,r[8]=u*m+d*y+p*E,this}multiplyScalar(t){const e=this.elements;return e[0]*=t,e[3]*=t,e[6]*=t,e[1]*=t,e[4]*=t,e[7]*=t,e[2]*=t,e[5]*=t,e[8]*=t,this}determinant(){const t=this.elements,e=t[0],n=t[1],i=t[2],r=t[3],a=t[4],o=t[5],l=t[6],c=t[7],h=t[8];return e*a*h-e*o*c-n*r*h+n*o*l+i*r*c-i*a*l}invert(){const t=this.elements,e=t[0],n=t[1],i=t[2],r=t[3],a=t[4],o=t[5],l=t[6],c=t[7],h=t[8],f=h*a-o*c,u=o*l-h*r,d=c*r-a*l,p=e*f+n*u+i*d;if(p===0)return this.set(0,0,0,0,0,0,0,0,0);const _=1/p;return t[0]=f*_,t[1]=(i*c-h*n)*_,t[2]=(o*n-i*a)*_,t[3]=u*_,t[4]=(h*e-i*l)*_,t[5]=(i*r-o*e)*_,t[6]=d*_,t[7]=(n*l-c*e)*_,t[8]=(a*e-n*r)*_,this}transpose(){let t;const e=this.elements;return t=e[1],e[1]=e[3],e[3]=t,t=e[2],e[2]=e[6],e[6]=t,t=e[5],e[5]=e[7],e[7]=t,this}getNormalMatrix(t){return this.setFromMatrix4(t).invert().transpose()}transposeIntoArray(t){const e=this.elements;return t[0]=e[0],t[1]=e[3],t[2]=e[6],t[3]=e[1],t[4]=e[4],t[5]=e[7],t[6]=e[2],t[7]=e[5],t[8]=e[8],this}setUvTransform(t,e,n,i,r,a,o){const l=Math.cos(r),c=Math.sin(r);return this.set(n*l,n*c,-n*(l*a+c*o)+a+t,-i*c,i*l,-i*(-c*a+l*o)+o+e,0,0,1),this}scale(t,e){return Ci("Matrix3: .scale() is deprecated. Use .makeScale() instead."),this.premultiply(Pc.makeScale(t,e)),this}rotate(t){return Ci("Matrix3: .rotate() is deprecated. Use .makeRotation() instead."),this.premultiply(Pc.makeRotation(-t)),this}translate(t,e){return Ci("Matrix3: .translate() is deprecated. Use .makeTranslation() instead."),this.premultiply(Pc.makeTranslation(t,e)),this}makeTranslation(t,e){return t.isVector2?this.set(1,0,t.x,0,1,t.y,0,0,1):this.set(1,0,t,0,1,e,0,0,1),this}makeRotation(t){const e=Math.cos(t),n=Math.sin(t);return this.set(e,-n,0,n,e,0,0,0,1),this}makeScale(t,e){return this.set(t,0,0,0,e,0,0,0,1),this}equals(t){const e=this.elements,n=t.elements;for(let i=0;i<9;i++)if(e[i]!==n[i])return!1;return!0}fromArray(t,e=0){for(let n=0;n<9;n++)this.elements[n]=t[n+e];return this}toArray(t=[],e=0){const n=this.elements;return t[e]=n[0],t[e+1]=n[1],t[e+2]=n[2],t[e+3]=n[3],t[e+4]=n[4],t[e+5]=n[5],t[e+6]=n[6],t[e+7]=n[7],t[e+8]=n[8],t}clone(){return new this.constructor().fromArray(this.elements)}};Wu.prototype.isMatrix3=!0;let Jt=Wu;const Pc=new Jt,ad=new Jt().set(.4123908,.3575843,.1804808,.212639,.7151687,.0721923,.0193308,.1191948,.9505322),od=new Jt().set(3.2409699,-1.5373832,-.4986108,-.9692436,1.8759675,.0415551,.0556301,-.203977,1.0569715);function P0(){const s={enabled:!0,workingColorSpace:va,spaces:{},convert:function(i,r,a){return this.enabled===!1||r===a||!r||!a||(this.spaces[r].transfer===me&&(i.r=Ri(i.r),i.g=Ri(i.g),i.b=Ri(i.b)),this.spaces[r].primaries!==this.spaces[a].primaries&&(i.applyMatrix3(this.spaces[r].toXYZ),i.applyMatrix3(this.spaces[a].fromXYZ)),this.spaces[a].transfer===me&&(i.r=hr(i.r),i.g=hr(i.g),i.b=hr(i.b))),i},workingToColorSpace:function(i,r){return this.convert(i,this.workingColorSpace,r)},colorSpaceToWorking:function(i,r){return this.convert(i,r,this.workingColorSpace)},getPrimaries:function(i){return this.spaces[i].primaries},getTransfer:function(i){return i===Si?Ma:this.spaces[i].transfer},getToneMappingMode:function(i){return this.spaces[i].outputColorSpaceConfig.toneMappingMode||"standard"},getLuminanceCoefficients:function(i,r=this.workingColorSpace){return i.fromArray(this.spaces[r].luminanceCoefficients)},define:function(i){Object.assign(this.spaces,i)},_getMatrix:function(i,r,a){return i.copy(this.spaces[r].toXYZ).multiply(this.spaces[a].fromXYZ)},_getDrawingBufferColorSpace:function(i){return this.spaces[i].outputColorSpaceConfig.drawingBufferColorSpace},_getUnpackColorSpace:function(i=this.workingColorSpace){return this.spaces[i].workingColorSpaceConfig.unpackColorSpace},fromWorkingColorSpace:function(i,r){return Ci("ColorManagement: .fromWorkingColorSpace() has been renamed to .workingToColorSpace()."),s.workingToColorSpace(i,r)},toWorkingColorSpace:function(i,r){return Ci("ColorManagement: .toWorkingColorSpace() has been renamed to .colorSpaceToWorking()."),s.colorSpaceToWorking(i,r)}},t=[.64,.33,.3,.6,.15,.06],e=[.2126,.7152,.0722],n=[.3127,.329];return s.define({[va]:{primaries:t,whitePoint:n,transfer:Ma,toXYZ:ad,fromXYZ:od,luminanceCoefficients:e,workingColorSpaceConfig:{unpackColorSpace:cn},outputColorSpaceConfig:{drawingBufferColorSpace:cn}},[cn]:{primaries:t,whitePoint:n,transfer:me,toXYZ:ad,fromXYZ:od,luminanceCoefficients:e,outputColorSpaceConfig:{drawingBufferColorSpace:cn}}}),s}const ae=P0();function Ri(s){return s<.04045?s*.0773993808:Math.pow(s*.9478672986+.0521327014,2.4)}function hr(s){return s<.0031308?s*12.92:1.055*Math.pow(s,.41666)-.055}let Fs;class Ep{static getDataURL(t,e="image/png"){if(/^data:/i.test(t.src)||typeof HTMLCanvasElement>"u")return t.src;let n;if(t instanceof HTMLCanvasElement)n=t;else{Fs===void 0&&(Fs=Sa("canvas")),Fs.width=t.width,Fs.height=t.height;const i=Fs.getContext("2d");t instanceof ImageData?i.putImageData(t,0,0):i.drawImage(t,0,0,t.width,t.height),n=Fs}return n.toDataURL(e)}static sRGBToLinear(t){if(typeof HTMLImageElement<"u"&&t instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&t instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&t instanceof ImageBitmap){const e=Sa("canvas");e.width=t.width,e.height=t.height;const n=e.getContext("2d");n.drawImage(t,0,0,t.width,t.height);const i=n.getImageData(0,0,t.width,t.height),r=i.data;for(let a=0;a<r.length;a++)r[a]=Ri(r[a]/255)*255;return n.putImageData(i,0,0),e}else if(t.data){const e=t.data.slice(0);for(let n=0;n<e.length;n++)e instanceof Uint8Array||e instanceof Uint8ClampedArray?e[n]=Math.floor(Ri(e[n]/255)*255):e[n]=Ri(e[n]);return{data:e,width:t.width,height:t.height}}else return pt("ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied."),t}}let L0=0;class Ai{constructor(t=null){this.isTextureSource=!0,Object.defineProperty(this,"id",{value:L0++}),this.uuid=Cn(),this.data=t,this.dataReady=!0,this.version=0}getSize(t){const e=this.data;return typeof HTMLVideoElement<"u"&&e instanceof HTMLVideoElement?t.set(e.videoWidth,e.videoHeight,0):typeof VideoFrame<"u"&&e instanceof VideoFrame?t.set(e.displayWidth,e.displayHeight,0):e!==null?t.set(e.width,e.height,e.depth||0):t.set(0,0,0),t}set needsUpdate(t){t===!0&&this.version++}toJSON(t){const e=t===void 0||typeof t=="string";if(!e&&t.images[this.uuid]!==void 0)return t.images[this.uuid];const n={uuid:this.uuid,url:""},i=this.data;if(i!==null){let r;if(Array.isArray(i)){r=[];for(let a=0,o=i.length;a<o;a++)i[a].isDataTexture?r.push(Lc(i[a].image)):r.push(Lc(i[a]))}else r=Lc(i);n.url=r}return e||(t.images[this.uuid]=n),n}}function Lc(s){return typeof HTMLImageElement<"u"&&s instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&s instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&s instanceof ImageBitmap?Ep.getDataURL(s):s.data?{data:Array.from(s.data),width:s.width,height:s.height,type:s.data.constructor.name}:(pt("Texture: Unable to serialize Texture."),{})}class D0 extends Ai{constructor(t=null){Ci('Source: "Source" has been renamed to "TextureSource". Please update your code to use "THREE.TextureSource" instead.'),super(t),this.isSource=!0}}let N0=0;const Dc=new I;class Ce extends Jn{constructor(t=Ce.DEFAULT_IMAGE,e=Ce.DEFAULT_MAPPING,n=yn,i=yn,r=Ae,a=ri,o=dn,l=_n,c=Ce.DEFAULT_ANISOTROPY,h=Si){super(),this.isTexture=!0,Object.defineProperty(this,"id",{value:N0++}),this.uuid=Cn(),this.name="",this.source=new Ai(t),this.mipmaps=[],this.mapping=e,this.channel=0,this.wrapS=n,this.wrapT=i,this.magFilter=r,this.minFilter=a,this.anisotropy=c,this.format=o,this.internalFormat=null,this.type=l,this.offset=new it(0,0),this.repeat=new it(1,1),this.center=new it(0,0),this.rotation=0,this.matrixAutoUpdate=!0,this.matrix=new Jt,this.generateMipmaps=!0,this.premultiplyAlpha=!1,this.flipY=!0,this.unpackAlignment=4,this.colorSpace=h,this.userData={},this.updateRanges=[],this.version=0,this.onUpdate=null,this.renderTarget=null,this.isRenderTargetTexture=!1,this.isArrayTexture=!!(t&&t.depth&&t.depth>1),this.pmremVersion=0,this.normalized=!1}get width(){return this.source.getSize(Dc).x}get height(){return this.source.getSize(Dc).y}get depth(){return this.source.getSize(Dc).z}get image(){return this.source.data}set image(t){this.source.data=t}updateMatrix(){this.matrix.setUvTransform(this.offset.x,this.offset.y,this.repeat.x,this.repeat.y,this.rotation,this.center.x,this.center.y)}addUpdateRange(t,e){this.updateRanges.push({start:t,count:e})}clearUpdateRanges(){this.updateRanges.length=0}clone(){return new this.constructor().copy(this)}copy(t){return this.name=t.name,this.source=t.source,this.mipmaps=t.mipmaps.slice(0),this.mapping=t.mapping,this.channel=t.channel,this.wrapS=t.wrapS,this.wrapT=t.wrapT,this.magFilter=t.magFilter,this.minFilter=t.minFilter,this.anisotropy=t.anisotropy,this.format=t.format,this.internalFormat=t.internalFormat,this.type=t.type,this.normalized=t.normalized,this.offset.copy(t.offset),this.repeat.copy(t.repeat),this.center.copy(t.center),this.rotation=t.rotation,this.matrixAutoUpdate=t.matrixAutoUpdate,this.matrix.copy(t.matrix),this.generateMipmaps=t.generateMipmaps,this.premultiplyAlpha=t.premultiplyAlpha,this.flipY=t.flipY,this.unpackAlignment=t.unpackAlignment,this.colorSpace=t.colorSpace,this.renderTarget=t.renderTarget,this.isRenderTargetTexture=t.isRenderTargetTexture,this.isArrayTexture=t.isArrayTexture,this.userData=JSON.parse(JSON.stringify(t.userData)),this.needsUpdate=!0,this}setValues(t){for(const e in t){const n=t[e];if(n===void 0){pt(`Texture.setValues(): parameter '${e}' has value of undefined.`);continue}const i=this[e];if(i===void 0){pt(`Texture.setValues(): property '${e}' does not exist.`);continue}i&&n&&i.isVector2&&n.isVector2||i&&n&&i.isVector3&&n.isVector3||i&&n&&i.isMatrix3&&n.isMatrix3?i.copy(n):this[e]=n}}toJSON(t){const e=t===void 0||typeof t=="string";if(!e&&t.textures[this.uuid]!==void 0)return t.textures[this.uuid];const n={metadata:{version:4.7,type:"Texture",generator:"Texture.toJSON"},uuid:this.uuid,name:this.name,image:this.source.toJSON(t).uuid,mapping:this.mapping,channel:this.channel,repeat:[this.repeat.x,this.repeat.y],offset:[this.offset.x,this.offset.y],center:[this.center.x,this.center.y],rotation:this.rotation,wrap:[this.wrapS,this.wrapT],format:this.format,internalFormat:this.internalFormat,type:this.type,normalized:this.normalized,colorSpace:this.colorSpace,minFilter:this.minFilter,magFilter:this.magFilter,anisotropy:this.anisotropy,flipY:this.flipY,generateMipmaps:this.generateMipmaps,premultiplyAlpha:this.premultiplyAlpha,unpackAlignment:this.unpackAlignment};return Object.keys(this.userData).length>0&&(n.userData=this.userData),e||(t.textures[this.uuid]=n),n}dispose(){this.dispatchEvent({type:"dispose"})}transformUv(t){if(this.mapping!==kl)return t;if(t.applyMatrix3(this.matrix),t.x<0||t.x>1)switch(this.wrapS){case pa:t.x=t.x-Math.floor(t.x);break;case yn:t.x=t.x<0?0:1;break;case ma:Math.abs(Math.floor(t.x)%2)===1?t.x=Math.ceil(t.x)-t.x:t.x=t.x-Math.floor(t.x);break}if(t.y<0||t.y>1)switch(this.wrapT){case pa:t.y=t.y-Math.floor(t.y);break;case yn:t.y=t.y<0?0:1;break;case ma:Math.abs(Math.floor(t.y)%2)===1?t.y=Math.ceil(t.y)-t.y:t.y=t.y-Math.floor(t.y);break}return this.flipY&&(t.y=1-t.y),t}set needsUpdate(t){t===!0&&(this.version++,this.source.needsUpdate=!0)}set needsPMREMUpdate(t){t===!0&&this.pmremVersion++}}Ce.DEFAULT_IMAGE=null;Ce.DEFAULT_MAPPING=kl;Ce.DEFAULT_ANISOTROPY=1;const Xu=class Xu{constructor(t=0,e=0,n=0,i=1){this.x=t,this.y=e,this.z=n,this.w=i}get width(){return this.z}set width(t){this.z=t}get height(){return this.w}set height(t){this.w=t}set(t,e,n,i){return this.x=t,this.y=e,this.z=n,this.w=i,this}setScalar(t){return this.x=t,this.y=t,this.z=t,this.w=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setZ(t){return this.z=t,this}setW(t){return this.w=t,this}setComponent(t,e){switch(t){case 0:this.x=e;break;case 1:this.y=e;break;case 2:this.z=e;break;case 3:this.w=e;break;default:throw new Error("THREE.Vector4: index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;case 2:return this.z;case 3:return this.w;default:throw new Error("THREE.Vector4: index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y,this.z,this.w)}copy(t){return this.x=t.x,this.y=t.y,this.z=t.z,this.w=t.w!==void 0?t.w:1,this}add(t){return this.x+=t.x,this.y+=t.y,this.z+=t.z,this.w+=t.w,this}addScalar(t){return this.x+=t,this.y+=t,this.z+=t,this.w+=t,this}addVectors(t,e){return this.x=t.x+e.x,this.y=t.y+e.y,this.z=t.z+e.z,this.w=t.w+e.w,this}addScaledVector(t,e){return this.x+=t.x*e,this.y+=t.y*e,this.z+=t.z*e,this.w+=t.w*e,this}sub(t){return this.x-=t.x,this.y-=t.y,this.z-=t.z,this.w-=t.w,this}subScalar(t){return this.x-=t,this.y-=t,this.z-=t,this.w-=t,this}subVectors(t,e){return this.x=t.x-e.x,this.y=t.y-e.y,this.z=t.z-e.z,this.w=t.w-e.w,this}multiply(t){return this.x*=t.x,this.y*=t.y,this.z*=t.z,this.w*=t.w,this}multiplyScalar(t){return this.x*=t,this.y*=t,this.z*=t,this.w*=t,this}applyMatrix4(t){const e=this.x,n=this.y,i=this.z,r=this.w,a=t.elements;return this.x=a[0]*e+a[4]*n+a[8]*i+a[12]*r,this.y=a[1]*e+a[5]*n+a[9]*i+a[13]*r,this.z=a[2]*e+a[6]*n+a[10]*i+a[14]*r,this.w=a[3]*e+a[7]*n+a[11]*i+a[15]*r,this}divide(t){return this.x/=t.x,this.y/=t.y,this.z/=t.z,this.w/=t.w,this}divideScalar(t){return this.multiplyScalar(1/t)}setAxisAngleFromQuaternion(t){this.w=2*Math.acos(t.w);const e=Math.sqrt(1-t.w*t.w);return e<1e-4?(this.x=1,this.y=0,this.z=0):(this.x=t.x/e,this.y=t.y/e,this.z=t.z/e),this}setAxisAngleFromRotationMatrix(t){let e,n,i,r;const l=t.elements,c=l[0],h=l[4],f=l[8],u=l[1],d=l[5],p=l[9],_=l[2],g=l[6],m=l[10];if(Math.abs(h-u)<.01&&Math.abs(f-_)<.01&&Math.abs(p-g)<.01){if(Math.abs(h+u)<.1&&Math.abs(f+_)<.1&&Math.abs(p+g)<.1&&Math.abs(c+d+m-3)<.1)return this.set(1,0,0,0),this;e=Math.PI;const M=(c+1)/2,y=(d+1)/2,w=(m+1)/2,b=(h+u)/4,E=(f+_)/4,v=(p+g)/4;return M>y&&M>w?M<.01?(n=0,i=.707106781,r=.707106781):(n=Math.sqrt(M),i=b/n,r=E/n):y>w?y<.01?(n=.707106781,i=0,r=.707106781):(i=Math.sqrt(y),n=b/i,r=v/i):w<.01?(n=.707106781,i=.707106781,r=0):(r=Math.sqrt(w),n=E/r,i=v/r),this.set(n,i,r,e),this}let x=Math.sqrt((g-p)*(g-p)+(f-_)*(f-_)+(u-h)*(u-h));return Math.abs(x)<.001&&(x=1),this.x=(g-p)/x,this.y=(f-_)/x,this.z=(u-h)/x,this.w=Math.acos((c+d+m-1)/2),this}setFromMatrixPosition(t){const e=t.elements;return this.x=e[12],this.y=e[13],this.z=e[14],this.w=e[15],this}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this.z=Math.min(this.z,t.z),this.w=Math.min(this.w,t.w),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this.z=Math.max(this.z,t.z),this.w=Math.max(this.w,t.w),this}clamp(t,e){return this.x=Ht(this.x,t.x,e.x),this.y=Ht(this.y,t.y,e.y),this.z=Ht(this.z,t.z,e.z),this.w=Ht(this.w,t.w,e.w),this}clampScalar(t,e){return this.x=Ht(this.x,t,e),this.y=Ht(this.y,t,e),this.z=Ht(this.z,t,e),this.w=Ht(this.w,t,e),this}clampLength(t,e){const n=this.length();return this.divideScalar(n||1).multiplyScalar(Ht(n,t,e))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this.w=Math.floor(this.w),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this.w=Math.ceil(this.w),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this.w=Math.round(this.w),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this.w=Math.trunc(this.w),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this.w=-this.w,this}dot(t){return this.x*t.x+this.y*t.y+this.z*t.z+this.w*t.w}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)+Math.abs(this.w)}normalize(){return this.divideScalar(this.length()||1)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,e){return this.x+=(t.x-this.x)*e,this.y+=(t.y-this.y)*e,this.z+=(t.z-this.z)*e,this.w+=(t.w-this.w)*e,this}lerpVectors(t,e,n){return this.x=t.x+(e.x-t.x)*n,this.y=t.y+(e.y-t.y)*n,this.z=t.z+(e.z-t.z)*n,this.w=t.w+(e.w-t.w)*n,this}equals(t){return t.x===this.x&&t.y===this.y&&t.z===this.z&&t.w===this.w}fromArray(t,e=0){return this.x=t[e],this.y=t[e+1],this.z=t[e+2],this.w=t[e+3],this}toArray(t=[],e=0){return t[e]=this.x,t[e+1]=this.y,t[e+2]=this.z,t[e+3]=this.w,t}fromBufferAttribute(t,e){return this.x=t.getX(e),this.y=t.getY(e),this.z=t.getZ(e),this.w=t.getW(e),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this.w=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z,yield this.w}};Xu.prototype.isVector4=!0;let xe=Xu;class ru extends Jn{constructor(t=1,e=1,n={}){super(),n=Object.assign({generateMipmaps:!1,internalFormat:null,minFilter:Ae,depthBuffer:!0,stencilBuffer:!1,resolveColorBuffer:!0,resolveDepthBuffer:!0,resolveStencilBuffer:!0,storeMultisampledColorBuffer:!0,storeMultisampledDepthBuffer:!0,storeMultisampledStencilBuffer:!0,depthTexture:null,samples:0,count:1,depth:1,multiview:!1,useArrayDepthTexture:!1},n),this.isRenderTarget=!0,this.width=t,this.height=e,this.depth=n.depth,this.scissor=new xe(0,0,t,e),this.scissorTest=!1,this.viewport=new xe(0,0,t,e),this.textures=[];const i={width:t,height:e,depth:n.depth},r=new Ce(i),a=n.count;for(let o=0;o<a;o++)this.textures[o]=r.clone(),this.textures[o].isRenderTargetTexture=!0,this.textures[o].renderTarget=this;this._setTextureOptions(n),this.depthBuffer=n.depthBuffer,this.stencilBuffer=n.stencilBuffer,this.resolveColorBuffer=n.resolveColorBuffer,this.resolveDepthBuffer=n.resolveDepthBuffer,this.resolveStencilBuffer=n.resolveStencilBuffer,this.storeMultisampledColorBuffer=n.storeMultisampledColorBuffer,this.storeMultisampledDepthBuffer=n.storeMultisampledDepthBuffer,this.storeMultisampledStencilBuffer=n.storeMultisampledStencilBuffer,this._depthTexture=null,this.depthTexture=n.depthTexture,this.samples=n.samples,this.multiview=n.multiview,this.useArrayDepthTexture=n.useArrayDepthTexture}_setTextureOptions(t={}){const e={minFilter:Ae,generateMipmaps:!1,flipY:!1,internalFormat:null};t.mapping!==void 0&&(e.mapping=t.mapping),t.wrapS!==void 0&&(e.wrapS=t.wrapS),t.wrapT!==void 0&&(e.wrapT=t.wrapT),t.wrapR!==void 0&&(e.wrapR=t.wrapR),t.magFilter!==void 0&&(e.magFilter=t.magFilter),t.minFilter!==void 0&&(e.minFilter=t.minFilter),t.format!==void 0&&(e.format=t.format),t.type!==void 0&&(e.type=t.type),t.anisotropy!==void 0&&(e.anisotropy=t.anisotropy),t.colorSpace!==void 0&&(e.colorSpace=t.colorSpace),t.flipY!==void 0&&(e.flipY=t.flipY),t.generateMipmaps!==void 0&&(e.generateMipmaps=t.generateMipmaps),t.internalFormat!==void 0&&(e.internalFormat=t.internalFormat);for(let n=0;n<this.textures.length;n++)this.textures[n].setValues(e)}get texture(){return this.textures[0]}set texture(t){this.textures[0]=t}set depthTexture(t){this._depthTexture!==null&&this._depthTexture.renderTarget===this&&(this._depthTexture.renderTarget=null),t!==null&&t.renderTarget===null&&(t.renderTarget=this),this._depthTexture=t}get depthTexture(){return this._depthTexture}setSize(t,e,n=1){if(this.width!==t||this.height!==e||this.depth!==n){this.width=t,this.height=e,this.depth=n;for(let i=0,r=this.textures.length;i<r;i++)this.textures[i].image.width=t,this.textures[i].image.height=e,this.textures[i].image.depth=n,this.textures[i].isData3DTexture!==!0&&(this.textures[i].isArrayTexture=this.textures[i].image.depth>1);this.dispose()}this.viewport.set(0,0,t,e),this.scissor.set(0,0,t,e)}clone(){return new this.constructor().copy(this)}copy(t){this.width=t.width,this.height=t.height,this.depth=t.depth,this.scissor.copy(t.scissor),this.scissorTest=t.scissorTest,this.viewport.copy(t.viewport),this.textures.length=0;for(let e=0,n=t.textures.length;e<n;e++){this.textures[e]=t.textures[e].clone(),this.textures[e].isRenderTargetTexture=!0,this.textures[e].renderTarget=this;const i=Object.assign({},t.textures[e].image);this.textures[e].source=new Ai(i)}if(this.depthBuffer=t.depthBuffer,this.stencilBuffer=t.stencilBuffer,this.resolveColorBuffer=t.resolveColorBuffer,this.resolveDepthBuffer=t.resolveDepthBuffer,this.resolveStencilBuffer=t.resolveStencilBuffer,this.storeMultisampledColorBuffer=t.storeMultisampledColorBuffer,this.storeMultisampledDepthBuffer=t.storeMultisampledDepthBuffer,this.storeMultisampledStencilBuffer=t.storeMultisampledStencilBuffer,t.depthTexture!==null)if(t.depthTexture.renderTarget===t){const e=t.depthTexture.clone();e.renderTarget=null,this.depthTexture=e}else this.depthTexture=t.depthTexture;return this.samples=t.samples,this.multiview=t.multiview,this.useArrayDepthTexture=t.useArrayDepthTexture,this}dispose(){this.dispatchEvent({type:"dispose"})}}class Mn extends ru{constructor(t=1,e=1,n={}){super(t,e,n),this.isWebGLRenderTarget=!0}}class Kl extends Ce{constructor(t=null,e=1,n=1,i=1){super(null),this.isDataArrayTexture=!0,this.image={data:t,width:e,height:n,depth:i},this.magFilter=Be,this.minFilter=Be,this.wrapR=yn,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1,this.layerUpdates=new Set}copy(t){return super.copy(t),this.wrapR=t.wrapR,this}addLayerUpdate(t){this.layerUpdates.add(t)}clearLayerUpdates(){this.layerUpdates.clear()}}class U0 extends Mn{constructor(t=1,e=1,n=1,i={}){super(t,e,i),this.isWebGLArrayRenderTarget=!0,this.depth=n,this.texture=new Kl(null,t,e,n),this._setTextureOptions(i),this.texture.isRenderTargetTexture=!0}}class Ql extends Ce{constructor(t=null,e=1,n=1,i=1){super(null),this.isData3DTexture=!0,this.image={data:t,width:e,height:n,depth:i},this.magFilter=Be,this.minFilter=Be,this.wrapR=yn,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}copy(t){return super.copy(t),this.wrapR=t.wrapR,this}}class F0 extends Mn{constructor(t=1,e=1,n=1,i={}){super(t,e,i),this.isWebGL3DRenderTarget=!0,this.depth=n,this.texture=new Ql(null,t,e,n),this._setTextureOptions(i),this.texture.isRenderTargetTexture=!0}}const Ol=class Ol{constructor(t,e,n,i,r,a,o,l,c,h,f,u,d,p,_,g){this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],t!==void 0&&this.set(t,e,n,i,r,a,o,l,c,h,f,u,d,p,_,g)}set(t,e,n,i,r,a,o,l,c,h,f,u,d,p,_,g){const m=this.elements;return m[0]=t,m[4]=e,m[8]=n,m[12]=i,m[1]=r,m[5]=a,m[9]=o,m[13]=l,m[2]=c,m[6]=h,m[10]=f,m[14]=u,m[3]=d,m[7]=p,m[11]=_,m[15]=g,this}identity(){return this.set(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1),this}clone(){return new Ol().fromArray(this.elements)}copy(t){const e=this.elements,n=t.elements;return e[0]=n[0],e[1]=n[1],e[2]=n[2],e[3]=n[3],e[4]=n[4],e[5]=n[5],e[6]=n[6],e[7]=n[7],e[8]=n[8],e[9]=n[9],e[10]=n[10],e[11]=n[11],e[12]=n[12],e[13]=n[13],e[14]=n[14],e[15]=n[15],this}copyPosition(t){const e=this.elements,n=t.elements;return e[12]=n[12],e[13]=n[13],e[14]=n[14],this}setFromMatrix3(t){const e=t.elements;return this.set(e[0],e[3],e[6],0,e[1],e[4],e[7],0,e[2],e[5],e[8],0,0,0,0,1),this}extractBasis(t,e,n){return this.determinantAffine()===0?(t.set(1,0,0),e.set(0,1,0),n.set(0,0,1),this):(t.setFromMatrixColumn(this,0),e.setFromMatrixColumn(this,1),n.setFromMatrixColumn(this,2),this)}makeBasis(t,e,n){return this.set(t.x,e.x,n.x,0,t.y,e.y,n.y,0,t.z,e.z,n.z,0,0,0,0,1),this}extractRotation(t){if(t.determinantAffine()===0)return this.identity();const e=this.elements,n=t.elements,i=1/Os.setFromMatrixColumn(t,0).length(),r=1/Os.setFromMatrixColumn(t,1).length(),a=1/Os.setFromMatrixColumn(t,2).length();return e[0]=n[0]*i,e[1]=n[1]*i,e[2]=n[2]*i,e[3]=0,e[4]=n[4]*r,e[5]=n[5]*r,e[6]=n[6]*r,e[7]=0,e[8]=n[8]*a,e[9]=n[9]*a,e[10]=n[10]*a,e[11]=0,e[12]=0,e[13]=0,e[14]=0,e[15]=1,this}makeRotationFromEuler(t){const e=this.elements,n=t.x,i=t.y,r=t.z,a=Math.cos(n),o=Math.sin(n),l=Math.cos(i),c=Math.sin(i),h=Math.cos(r),f=Math.sin(r);if(t.order==="XYZ"){const u=a*h,d=a*f,p=o*h,_=o*f;e[0]=l*h,e[4]=-l*f,e[8]=c,e[1]=d+p*c,e[5]=u-_*c,e[9]=-o*l,e[2]=_-u*c,e[6]=p+d*c,e[10]=a*l}else if(t.order==="YXZ"){const u=l*h,d=l*f,p=c*h,_=c*f;e[0]=u+_*o,e[4]=p*o-d,e[8]=a*c,e[1]=a*f,e[5]=a*h,e[9]=-o,e[2]=d*o-p,e[6]=_+u*o,e[10]=a*l}else if(t.order==="ZXY"){const u=l*h,d=l*f,p=c*h,_=c*f;e[0]=u-_*o,e[4]=-a*f,e[8]=p+d*o,e[1]=d+p*o,e[5]=a*h,e[9]=_-u*o,e[2]=-a*c,e[6]=o,e[10]=a*l}else if(t.order==="ZYX"){const u=a*h,d=a*f,p=o*h,_=o*f;e[0]=l*h,e[4]=p*c-d,e[8]=u*c+_,e[1]=l*f,e[5]=_*c+u,e[9]=d*c-p,e[2]=-c,e[6]=o*l,e[10]=a*l}else if(t.order==="YZX"){const u=a*l,d=a*c,p=o*l,_=o*c;e[0]=l*h,e[4]=_-u*f,e[8]=p*f+d,e[1]=f,e[5]=a*h,e[9]=-o*h,e[2]=-c*h,e[6]=d*f+p,e[10]=u-_*f}else if(t.order==="XZY"){const u=a*l,d=a*c,p=o*l,_=o*c;e[0]=l*h,e[4]=-f,e[8]=c*h,e[1]=u*f+_,e[5]=a*h,e[9]=d*f-p,e[2]=p*f-d,e[6]=o*h,e[10]=_*f+u}return e[3]=0,e[7]=0,e[11]=0,e[12]=0,e[13]=0,e[14]=0,e[15]=1,this}makeRotationFromQuaternion(t){return this.compose(O0,t,B0)}lookAt(t,e,n){const i=this.elements;return bn.subVectors(t,e),bn.lengthSq()===0&&(bn.z=1),bn.normalize(),Bi.crossVectors(n,bn),Bi.lengthSq()===0&&(Math.abs(n.z)===1?bn.x+=1e-4:bn.z+=1e-4,bn.normalize(),Bi.crossVectors(n,bn)),Bi.normalize(),Wa.crossVectors(bn,Bi),i[0]=Bi.x,i[4]=Wa.x,i[8]=bn.x,i[1]=Bi.y,i[5]=Wa.y,i[9]=bn.y,i[2]=Bi.z,i[6]=Wa.z,i[10]=bn.z,this}multiply(t){return this.multiplyMatrices(this,t)}premultiply(t){return this.multiplyMatrices(t,this)}multiplyMatrices(t,e){const n=t.elements,i=e.elements,r=this.elements,a=n[0],o=n[4],l=n[8],c=n[12],h=n[1],f=n[5],u=n[9],d=n[13],p=n[2],_=n[6],g=n[10],m=n[14],x=n[3],M=n[7],y=n[11],w=n[15],b=i[0],E=i[4],v=i[8],T=i[12],C=i[1],P=i[5],L=i[9],N=i[13],D=i[2],O=i[6],V=i[10],z=i[14],G=i[3],X=i[7],$=i[11],Z=i[15];return r[0]=a*b+o*C+l*D+c*G,r[4]=a*E+o*P+l*O+c*X,r[8]=a*v+o*L+l*V+c*$,r[12]=a*T+o*N+l*z+c*Z,r[1]=h*b+f*C+u*D+d*G,r[5]=h*E+f*P+u*O+d*X,r[9]=h*v+f*L+u*V+d*$,r[13]=h*T+f*N+u*z+d*Z,r[2]=p*b+_*C+g*D+m*G,r[6]=p*E+_*P+g*O+m*X,r[10]=p*v+_*L+g*V+m*$,r[14]=p*T+_*N+g*z+m*Z,r[3]=x*b+M*C+y*D+w*G,r[7]=x*E+M*P+y*O+w*X,r[11]=x*v+M*L+y*V+w*$,r[15]=x*T+M*N+y*z+w*Z,this}multiplyScalar(t){const e=this.elements;return e[0]*=t,e[4]*=t,e[8]*=t,e[12]*=t,e[1]*=t,e[5]*=t,e[9]*=t,e[13]*=t,e[2]*=t,e[6]*=t,e[10]*=t,e[14]*=t,e[3]*=t,e[7]*=t,e[11]*=t,e[15]*=t,this}determinant(){const t=this.elements,e=t[0],n=t[4],i=t[8],r=t[12],a=t[1],o=t[5],l=t[9],c=t[13],h=t[2],f=t[6],u=t[10],d=t[14],p=t[3],_=t[7],g=t[11],m=t[15],x=l*d-c*u,M=o*d-c*f,y=o*u-l*f,w=a*d-c*h,b=a*u-l*h,E=a*f-o*h;return e*(_*x-g*M+m*y)-n*(p*x-g*w+m*b)+i*(p*M-_*w+m*E)-r*(p*y-_*b+g*E)}determinantAffine(){const t=this.elements,e=t[0],n=t[4],i=t[8],r=t[1],a=t[5],o=t[9],l=t[2],c=t[6],h=t[10];return e*(a*h-o*c)-n*(r*h-o*l)+i*(r*c-a*l)}transpose(){const t=this.elements;let e;return e=t[1],t[1]=t[4],t[4]=e,e=t[2],t[2]=t[8],t[8]=e,e=t[6],t[6]=t[9],t[9]=e,e=t[3],t[3]=t[12],t[12]=e,e=t[7],t[7]=t[13],t[13]=e,e=t[11],t[11]=t[14],t[14]=e,this}setPosition(t,e,n){const i=this.elements;return t.isVector3?(i[12]=t.x,i[13]=t.y,i[14]=t.z):(i[12]=t,i[13]=e,i[14]=n),this}invert(){const t=this.elements,e=t[0],n=t[1],i=t[2],r=t[3],a=t[4],o=t[5],l=t[6],c=t[7],h=t[8],f=t[9],u=t[10],d=t[11],p=t[12],_=t[13],g=t[14],m=t[15],x=e*o-n*a,M=e*l-i*a,y=e*c-r*a,w=n*l-i*o,b=n*c-r*o,E=i*c-r*l,v=h*_-f*p,T=h*g-u*p,C=h*m-d*p,P=f*g-u*_,L=f*m-d*_,N=u*m-d*g,D=x*N-M*L+y*P+w*C-b*T+E*v;if(D===0)return this.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);const O=1/D;return t[0]=(o*N-l*L+c*P)*O,t[1]=(i*L-n*N-r*P)*O,t[2]=(_*E-g*b+m*w)*O,t[3]=(u*b-f*E-d*w)*O,t[4]=(l*C-a*N-c*T)*O,t[5]=(e*N-i*C+r*T)*O,t[6]=(g*y-p*E-m*M)*O,t[7]=(h*E-u*y+d*M)*O,t[8]=(a*L-o*C+c*v)*O,t[9]=(n*C-e*L-r*v)*O,t[10]=(p*b-_*y+m*x)*O,t[11]=(f*y-h*b-d*x)*O,t[12]=(o*T-a*P-l*v)*O,t[13]=(e*P-n*T+i*v)*O,t[14]=(_*M-p*w-g*x)*O,t[15]=(h*w-f*M+u*x)*O,this}scale(t){const e=this.elements,n=t.x,i=t.y,r=t.z;return e[0]*=n,e[4]*=i,e[8]*=r,e[1]*=n,e[5]*=i,e[9]*=r,e[2]*=n,e[6]*=i,e[10]*=r,e[3]*=n,e[7]*=i,e[11]*=r,this}getMaxScaleOnAxis(){const t=this.elements,e=t[0]*t[0]+t[1]*t[1]+t[2]*t[2],n=t[4]*t[4]+t[5]*t[5]+t[6]*t[6],i=t[8]*t[8]+t[9]*t[9]+t[10]*t[10];return Math.sqrt(Math.max(e,n,i))}makeTranslation(t,e,n){return t.isVector3?this.set(1,0,0,t.x,0,1,0,t.y,0,0,1,t.z,0,0,0,1):this.set(1,0,0,t,0,1,0,e,0,0,1,n,0,0,0,1),this}makeRotationX(t){const e=Math.cos(t),n=Math.sin(t);return this.set(1,0,0,0,0,e,-n,0,0,n,e,0,0,0,0,1),this}makeRotationY(t){const e=Math.cos(t),n=Math.sin(t);return this.set(e,0,n,0,0,1,0,0,-n,0,e,0,0,0,0,1),this}makeRotationZ(t){const e=Math.cos(t),n=Math.sin(t);return this.set(e,-n,0,0,n,e,0,0,0,0,1,0,0,0,0,1),this}makeRotationAxis(t,e){const n=Math.cos(e),i=Math.sin(e),r=1-n,a=t.x,o=t.y,l=t.z,c=r*a,h=r*o;return this.set(c*a+n,c*o-i*l,c*l+i*o,0,c*o+i*l,h*o+n,h*l-i*a,0,c*l-i*o,h*l+i*a,r*l*l+n,0,0,0,0,1),this}makeScale(t,e,n){return this.set(t,0,0,0,0,e,0,0,0,0,n,0,0,0,0,1),this}makeShear(t,e,n,i,r,a){return this.set(1,n,r,0,t,1,a,0,e,i,1,0,0,0,0,1),this}compose(t,e,n){const i=this.elements,r=e._x,a=e._y,o=e._z,l=e._w,c=r+r,h=a+a,f=o+o,u=r*c,d=r*h,p=r*f,_=a*h,g=a*f,m=o*f,x=l*c,M=l*h,y=l*f,w=n.x,b=n.y,E=n.z;return i[0]=(1-(_+m))*w,i[1]=(d+y)*w,i[2]=(p-M)*w,i[3]=0,i[4]=(d-y)*b,i[5]=(1-(u+m))*b,i[6]=(g+x)*b,i[7]=0,i[8]=(p+M)*E,i[9]=(g-x)*E,i[10]=(1-(u+_))*E,i[11]=0,i[12]=t.x,i[13]=t.y,i[14]=t.z,i[15]=1,this}decompose(t,e,n){const i=this.elements;t.x=i[12],t.y=i[13],t.z=i[14];const r=this.determinantAffine();if(r===0)return n.set(1,1,1),e.identity(),this;let a=Os.set(i[0],i[1],i[2]).length();const o=Os.set(i[4],i[5],i[6]).length(),l=Os.set(i[8],i[9],i[10]).length();r<0&&(a=-a),zn.copy(this);const c=1/a,h=1/o,f=1/l;return zn.elements[0]*=c,zn.elements[1]*=c,zn.elements[2]*=c,zn.elements[4]*=h,zn.elements[5]*=h,zn.elements[6]*=h,zn.elements[8]*=f,zn.elements[9]*=f,zn.elements[10]*=f,e.setFromRotationMatrix(zn),n.x=a,n.y=o,n.z=l,this}makePerspective(t,e,n,i,r,a,o=En,l=!1){const c=this.elements,h=2*r/(e-t),f=2*r/(n-i),u=(e+t)/(e-t),d=(n+i)/(n-i);let p,_;if(l)p=r/(a-r),_=a*r/(a-r);else if(o===En)p=-(a+r)/(a-r),_=-2*a*r/(a-r);else if(o===As)p=-a/(a-r),_=-a*r/(a-r);else throw new Error("THREE.Matrix4.makePerspective(): Invalid coordinate system: "+o);return c[0]=h,c[4]=0,c[8]=u,c[12]=0,c[1]=0,c[5]=f,c[9]=d,c[13]=0,c[2]=0,c[6]=0,c[10]=p,c[14]=_,c[3]=0,c[7]=0,c[11]=-1,c[15]=0,this}makeOrthographic(t,e,n,i,r,a,o=En,l=!1){const c=this.elements,h=2/(e-t),f=2/(n-i),u=-(e+t)/(e-t),d=-(n+i)/(n-i);let p,_;if(l)p=1/(a-r),_=a/(a-r);else if(o===En)p=-2/(a-r),_=-(a+r)/(a-r);else if(o===As)p=-1/(a-r),_=-r/(a-r);else throw new Error("THREE.Matrix4.makeOrthographic(): Invalid coordinate system: "+o);return c[0]=h,c[4]=0,c[8]=0,c[12]=u,c[1]=0,c[5]=f,c[9]=0,c[13]=d,c[2]=0,c[6]=0,c[10]=p,c[14]=_,c[3]=0,c[7]=0,c[11]=0,c[15]=1,this}equals(t){const e=this.elements,n=t.elements;for(let i=0;i<16;i++)if(e[i]!==n[i])return!1;return!0}fromArray(t,e=0){for(let n=0;n<16;n++)this.elements[n]=t[n+e];return this}toArray(t=[],e=0){const n=this.elements;return t[e]=n[0],t[e+1]=n[1],t[e+2]=n[2],t[e+3]=n[3],t[e+4]=n[4],t[e+5]=n[5],t[e+6]=n[6],t[e+7]=n[7],t[e+8]=n[8],t[e+9]=n[9],t[e+10]=n[10],t[e+11]=n[11],t[e+12]=n[12],t[e+13]=n[13],t[e+14]=n[14],t[e+15]=n[15],t}};Ol.prototype.isMatrix4=!0;let Yt=Ol;const Os=new I,zn=new Yt,O0=new I(0,0,0),B0=new I(1,1,1),Bi=new I,Wa=new I,bn=new I,ld=new Yt,cd=new sn;class $n{constructor(t=0,e=0,n=0,i=$n.DEFAULT_ORDER){this.isEuler=!0,this._x=t,this._y=e,this._z=n,this._order=i}get x(){return this._x}set x(t){this._x=t,this._onChangeCallback()}get y(){return this._y}set y(t){this._y=t,this._onChangeCallback()}get z(){return this._z}set z(t){this._z=t,this._onChangeCallback()}get order(){return this._order}set order(t){this._order=t,this._onChangeCallback()}set(t,e,n,i=this._order){return this._x=t,this._y=e,this._z=n,this._order=i,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._order)}copy(t){return this._x=t._x,this._y=t._y,this._z=t._z,this._order=t._order,this._onChangeCallback(),this}setFromRotationMatrix(t,e=this._order,n=!0){const i=t.elements,r=i[0],a=i[4],o=i[8],l=i[1],c=i[5],h=i[9],f=i[2],u=i[6],d=i[10];switch(e){case"XYZ":this._y=Math.asin(Ht(o,-1,1)),Math.abs(o)<.9999999?(this._x=Math.atan2(-h,d),this._z=Math.atan2(-a,r)):(this._x=Math.atan2(u,c),this._z=0);break;case"YXZ":this._x=Math.asin(-Ht(h,-1,1)),Math.abs(h)<.9999999?(this._y=Math.atan2(o,d),this._z=Math.atan2(l,c)):(this._y=Math.atan2(-f,r),this._z=0);break;case"ZXY":this._x=Math.asin(Ht(u,-1,1)),Math.abs(u)<.9999999?(this._y=Math.atan2(-f,d),this._z=Math.atan2(-a,c)):(this._y=0,this._z=Math.atan2(l,r));break;case"ZYX":this._y=Math.asin(-Ht(f,-1,1)),Math.abs(f)<.9999999?(this._x=Math.atan2(u,d),this._z=Math.atan2(l,r)):(this._x=0,this._z=Math.atan2(-a,c));break;case"YZX":this._z=Math.asin(Ht(l,-1,1)),Math.abs(l)<.9999999?(this._x=Math.atan2(-h,c),this._y=Math.atan2(-f,r)):(this._x=0,this._y=Math.atan2(o,d));break;case"XZY":this._z=Math.asin(-Ht(a,-1,1)),Math.abs(a)<.9999999?(this._x=Math.atan2(u,c),this._y=Math.atan2(o,r)):(this._x=Math.atan2(-h,d),this._y=0);break;default:pt("Euler: .setFromRotationMatrix() encountered an unknown order: "+e)}return this._order=e,n===!0&&this._onChangeCallback(),this}setFromQuaternion(t,e,n){return ld.makeRotationFromQuaternion(t),this.setFromRotationMatrix(ld,e,n)}setFromVector3(t,e=this._order){return this.set(t.x,t.y,t.z,e)}reorder(t){return cd.setFromEuler(this),this.setFromQuaternion(cd,t)}equals(t){return t._x===this._x&&t._y===this._y&&t._z===this._z&&t._order===this._order}fromArray(t){return this._x=t[0],this._y=t[1],this._z=t[2],t[3]!==void 0&&(this._order=t[3]),this._onChangeCallback(),this}toArray(t=[],e=0){return t[e]=this._x,t[e+1]=this._y,t[e+2]=this._z,t[e+3]=this._order,t}_onChange(t){return this._onChangeCallback=t,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._order}}$n.DEFAULT_ORDER="XYZ";class jl{constructor(){this.mask=1}set(t){this.mask=(1<<t|0)>>>0}enable(t){this.mask|=1<<t|0}enableAll(){this.mask=-1}toggle(t){this.mask^=1<<t|0}disable(t){this.mask&=~(1<<t|0)}disableAll(){this.mask=0}test(t){return(this.mask&t.mask)!==0}isEnabled(t){return(this.mask&(1<<t|0))!==0}}let z0=0;const hd=new I,Bs=new sn,fi=new Yt,Xa=new I,Ir=new I,k0=new I,V0=new sn,ud=new I(1,0,0),dd=new I(0,1,0),fd=new I(0,0,1),pd={type:"added"},G0={type:"removed"},zs={type:"childadded",child:null},Nc={type:"childremoved",child:null};class he extends Jn{constructor(){super(),this.isObject3D=!0,Object.defineProperty(this,"id",{value:z0++}),this.uuid=Cn(),this.name="",this.type="Object3D",this.parent=null,this.children=[],this.up=he.DEFAULT_UP.clone();const t=new I,e=new $n,n=new sn,i=new I(1,1,1);function r(){n.setFromEuler(e,!1)}function a(){e.setFromQuaternion(n,void 0,!1)}e._onChange(r),n._onChange(a),Object.defineProperties(this,{position:{configurable:!0,enumerable:!0,value:t},rotation:{configurable:!0,enumerable:!0,value:e},quaternion:{configurable:!0,enumerable:!0,value:n},scale:{configurable:!0,enumerable:!0,value:i},modelViewMatrix:{value:new Yt},normalMatrix:{value:new Jt}}),this.matrix=new Yt,this.matrixWorld=new Yt,this.matrixAutoUpdate=he.DEFAULT_MATRIX_AUTO_UPDATE,this.matrixWorldAutoUpdate=he.DEFAULT_MATRIX_WORLD_AUTO_UPDATE,this.matrixWorldNeedsUpdate=!1,this.layers=new jl,this.visible=!0,this.castShadow=!1,this.receiveShadow=!1,this.frustumCulled=!0,this.renderOrder=0,this.animations=[],this.customDepthMaterial=void 0,this.customDistanceMaterial=void 0,this.static=!1,this.userData={},this.pivot=null}onBeforeShadow(){}onAfterShadow(){}onBeforeRender(){}onAfterRender(){}applyMatrix4(t){this.matrixAutoUpdate&&this.updateMatrix(),this.matrix.premultiply(t),this.matrix.decompose(this.position,this.quaternion,this.scale)}applyQuaternion(t){return this.quaternion.premultiply(t),this}setRotationFromAxisAngle(t,e){this.quaternion.setFromAxisAngle(t,e)}setRotationFromEuler(t){this.quaternion.setFromEuler(t,!0)}setRotationFromMatrix(t){this.quaternion.setFromRotationMatrix(t)}setRotationFromQuaternion(t){this.quaternion.copy(t)}rotateOnAxis(t,e){return Bs.setFromAxisAngle(t,e),this.quaternion.multiply(Bs),this}rotateOnWorldAxis(t,e){return Bs.setFromAxisAngle(t,e),this.quaternion.premultiply(Bs),this}rotateX(t){return this.rotateOnAxis(ud,t)}rotateY(t){return this.rotateOnAxis(dd,t)}rotateZ(t){return this.rotateOnAxis(fd,t)}translateOnAxis(t,e){return hd.copy(t).applyQuaternion(this.quaternion),this.position.add(hd.multiplyScalar(e)),this}translateX(t){return this.translateOnAxis(ud,t)}translateY(t){return this.translateOnAxis(dd,t)}translateZ(t){return this.translateOnAxis(fd,t)}localToWorld(t){return this.updateWorldMatrix(!0,!1),t.applyMatrix4(this.matrixWorld)}worldToLocal(t){return this.updateWorldMatrix(!0,!1),t.applyMatrix4(fi.copy(this.matrixWorld).invert())}lookAt(t,e,n){t.isVector3?Xa.copy(t):Xa.set(t,e,n);const i=this.parent;this.updateWorldMatrix(!0,!1),Ir.setFromMatrixPosition(this.matrixWorld),this.isCamera||this.isLight?fi.lookAt(Ir,Xa,this.up):fi.lookAt(Xa,Ir,this.up),this.quaternion.setFromRotationMatrix(fi),i&&(fi.extractRotation(i.matrixWorld),Bs.setFromRotationMatrix(fi),this.quaternion.premultiply(Bs.invert()))}add(t){if(arguments.length>1){for(let e=0;e<arguments.length;e++)this.add(arguments[e]);return this}return t===this?(Nt("Object3D.add: object can't be added as a child of itself.",t),this):(t&&t.isObject3D?(t.removeFromParent(),t.parent=this,this.children.push(t),t.dispatchEvent(pd),zs.child=t,this.dispatchEvent(zs),zs.child=null):Nt("Object3D.add: object not an instance of THREE.Object3D.",t),this)}remove(t){if(arguments.length>1){for(let n=0;n<arguments.length;n++)this.remove(arguments[n]);return this}const e=this.children.indexOf(t);return e!==-1&&(t.parent=null,this.children.splice(e,1),t.dispatchEvent(G0),Nc.child=t,this.dispatchEvent(Nc),Nc.child=null),this}removeFromParent(){const t=this.parent;return t!==null&&t.remove(this),this}clear(){return this.remove(...this.children)}attach(t){return this.updateWorldMatrix(!0,!1),fi.copy(this.matrixWorld).invert(),t.parent!==null&&(t.parent.updateWorldMatrix(!0,!1),fi.multiply(t.parent.matrixWorld)),t.applyMatrix4(fi),t.removeFromParent(),t.parent=this,this.children.push(t),t.updateWorldMatrix(!1,!0),t.dispatchEvent(pd),zs.child=t,this.dispatchEvent(zs),zs.child=null,this}getObjectById(t){return this.getObjectByProperty("id",t)}getObjectByName(t){return this.getObjectByProperty("name",t)}getObjectByProperty(t,e){if(this[t]===e)return this;for(let n=0,i=this.children.length;n<i;n++){const a=this.children[n].getObjectByProperty(t,e);if(a!==void 0)return a}}getObjectsByProperty(t,e,n=[]){this[t]===e&&n.push(this);const i=this.children;for(let r=0,a=i.length;r<a;r++)i[r].getObjectsByProperty(t,e,n);return n}getWorldPosition(t){return this.updateWorldMatrix(!0,!1),t.setFromMatrixPosition(this.matrixWorld)}getWorldQuaternion(t){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(Ir,t,k0),t}getWorldScale(t){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(Ir,V0,t),t}getWorldDirection(t){this.updateWorldMatrix(!0,!1);const e=this.matrixWorld.elements;return t.set(e[8],e[9],e[10]).normalize()}raycast(){}intersectsFrustum(){}traverse(t){t(this);const e=this.children;for(let n=0,i=e.length;n<i;n++)e[n].traverse(t)}traverseVisible(t){if(this.visible===!1)return;t(this);const e=this.children;for(let n=0,i=e.length;n<i;n++)e[n].traverseVisible(t)}traverseAncestors(t){const e=this.parent;e!==null&&(t(e),e.traverseAncestors(t))}updateMatrix(){this.matrix.compose(this.position,this.quaternion,this.scale);const t=this.pivot;if(t!==null){const e=t.x,n=t.y,i=t.z,r=this.matrix.elements;r[12]+=e-r[0]*e-r[4]*n-r[8]*i,r[13]+=n-r[1]*e-r[5]*n-r[9]*i,r[14]+=i-r[2]*e-r[6]*n-r[10]*i}this.matrixWorldNeedsUpdate=!0}updateMatrixWorld(t){this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||t)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,t=!0);const e=this.children;for(let n=0,i=e.length;n<i;n++)e[n].updateMatrixWorld(t)}updateWorldMatrix(t,e,n=!1){const i=this.parent;if(t===!0&&i!==null&&i.updateWorldMatrix(!0,!1),this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||n)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,n=!0),e===!0){const r=this.children;for(let a=0,o=r.length;a<o;a++)r[a].updateWorldMatrix(!1,!0,n)}}toJSON(t){const e=t===void 0||typeof t=="string",n={};e&&(t={geometries:{},materials:{},textures:{},images:{},shapes:{},skeletons:{},animations:{},nodes:{}},n.metadata={version:4.7,type:"Object",generator:"Object3D.toJSON"});const i={};i.uuid=this.uuid,i.type=this.type,i.name=this.name,i.castShadow=this.castShadow,i.receiveShadow=this.receiveShadow,i.visible=this.visible,i.frustumCulled=this.frustumCulled,i.renderOrder=this.renderOrder,i.static=this.static,i.matrixAutoUpdate=this.matrixAutoUpdate,Object.keys(this.userData).length>0&&(i.userData=this.userData),i.layers=this.layers.mask,i.matrix=this.matrix.toArray(),i.up=this.up.toArray(),this.pivot!==null&&(i.pivot=this.pivot.toArray()),this.morphTargetDictionary!==void 0&&(i.morphTargetDictionary=Object.assign({},this.morphTargetDictionary)),this.morphTargetInfluences!==void 0&&(i.morphTargetInfluences=this.morphTargetInfluences.slice()),this.isInstancedMesh&&(i.type="InstancedMesh",i.count=this.count,i.instanceMatrix=this.instanceMatrix.toJSON(),this.instanceColor!==null&&(i.instanceColor=this.instanceColor.toJSON())),this.isBatchedMesh&&(i.type="BatchedMesh",i.perObjectFrustumCulled=this.perObjectFrustumCulled,i.sortObjects=this.sortObjects,i.drawRanges=this._drawRanges,i.reservedRanges=this._reservedRanges,i.geometryInfo=this._geometryInfo.map(o=>({...o,boundingBox:o.boundingBox?o.boundingBox.toJSON():void 0,boundingSphere:o.boundingSphere?o.boundingSphere.toJSON():void 0})),i.instanceInfo=this._instanceInfo.map(o=>({...o})),i.availableInstanceIds=this._availableInstanceIds.slice(),i.availableGeometryIds=this._availableGeometryIds.slice(),i.nextIndexStart=this._nextIndexStart,i.nextVertexStart=this._nextVertexStart,i.geometryCount=this._geometryCount,i.maxInstanceCount=this._maxInstanceCount,i.maxVertexCount=this._maxVertexCount,i.maxIndexCount=this._maxIndexCount,i.geometryInitialized=this._geometryInitialized,i.matricesTexture=this._matricesTexture.toJSON(t),i.indirectTexture=this._indirectTexture.toJSON(t),this._colorsTexture!==null&&(i.colorsTexture=this._colorsTexture.toJSON(t)),this.boundingSphere!==null&&(i.boundingSphere=this.boundingSphere.toJSON()),this.boundingBox!==null&&(i.boundingBox=this.boundingBox.toJSON()));function r(o,l){return o[l.uuid]===void 0&&(o[l.uuid]=l.toJSON(t)),l.uuid}if(this.isScene)this.background&&(this.background.isColor?i.background=this.background.toJSON():this.background.isTexture&&(i.background=this.background.toJSON(t).uuid)),this.environment&&this.environment.isTexture&&this.environment.isRenderTargetTexture!==!0&&(i.environment=this.environment.toJSON(t).uuid);else if(this.isMesh||this.isLine||this.isPoints){i.geometry=r(t.geometries,this.geometry);const o=this.geometry.parameters;if(o!==void 0&&o.shapes!==void 0){const l=o.shapes;if(Array.isArray(l))for(let c=0,h=l.length;c<h;c++){const f=l[c];r(t.shapes,f)}else r(t.shapes,l)}}if(this.isSkinnedMesh&&(i.bindMode=this.bindMode,i.bindMatrix=this.bindMatrix.toArray(),this.skeleton!==void 0&&(r(t.skeletons,this.skeleton),i.skeleton=this.skeleton.uuid)),this.material!==void 0)if(Array.isArray(this.material)){const o=[];for(let l=0,c=this.material.length;l<c;l++)o.push(r(t.materials,this.material[l]));i.material=o}else i.material=r(t.materials,this.material);if(this.children.length>0){i.children=[];for(let o=0;o<this.children.length;o++)i.children.push(this.children[o].toJSON(t).object)}if(this.animations.length>0){i.animations=[];for(let o=0;o<this.animations.length;o++){const l=this.animations[o];i.animations.push(r(t.animations,l))}}if(e){const o=a(t.geometries),l=a(t.materials),c=a(t.textures),h=a(t.images),f=a(t.shapes),u=a(t.skeletons),d=a(t.animations),p=a(t.nodes);o.length>0&&(n.geometries=o),l.length>0&&(n.materials=l),c.length>0&&(n.textures=c),h.length>0&&(n.images=h),f.length>0&&(n.shapes=f),u.length>0&&(n.skeletons=u),d.length>0&&(n.animations=d),p.length>0&&(n.nodes=p)}return n.object=i,n;function a(o){const l=[];for(const c in o){const h=o[c];delete h.metadata,l.push(h)}return l}}clone(t){return new this.constructor().copy(this,t)}copy(t,e=!0){if(this.name=t.name,this.up.copy(t.up),this.position.copy(t.position),this.rotation.order=t.rotation.order,this.quaternion.copy(t.quaternion),this.scale.copy(t.scale),this.pivot=t.pivot!==null?t.pivot.clone():null,this.matrix.copy(t.matrix),this.matrixWorld.copy(t.matrixWorld),this.matrixAutoUpdate=t.matrixAutoUpdate,this.matrixWorldAutoUpdate=t.matrixWorldAutoUpdate,this.matrixWorldNeedsUpdate=t.matrixWorldNeedsUpdate,this.layers.mask=t.layers.mask,this.visible=t.visible,this.castShadow=t.castShadow,this.receiveShadow=t.receiveShadow,this.frustumCulled=t.frustumCulled,this.renderOrder=t.renderOrder,this.static=t.static,this.animations=t.animations.slice(),this.userData=JSON.parse(JSON.stringify(t.userData)),e===!0)for(let n=0;n<t.children.length;n++){const i=t.children[n];this.add(i.clone())}return this}dispose(){this.dispatchEvent({type:"dispose"})}}he.DEFAULT_UP=new I(0,1,0);he.DEFAULT_MATRIX_AUTO_UPDATE=!0;he.DEFAULT_MATRIX_WORLD_AUTO_UPDATE=!0;class vn extends he{constructor(){super(),this.isGroup=!0,this.type="Group"}}const H0={type:"move"};class Ho{constructor(){this._targetRay=null,this._grip=null,this._hand=null}getHandSpace(){return this._hand===null&&(this._hand=new vn,this._hand.matrixAutoUpdate=!1,this._hand.visible=!1,this._hand.joints={},this._hand.inputState={pinching:!1}),this._hand}getTargetRaySpace(){return this._targetRay===null&&(this._targetRay=new vn,this._targetRay.matrixAutoUpdate=!1,this._targetRay.visible=!1,this._targetRay.hasLinearVelocity=!1,this._targetRay.linearVelocity=new I,this._targetRay.hasAngularVelocity=!1,this._targetRay.angularVelocity=new I),this._targetRay}getGripSpace(){return this._grip===null&&(this._grip=new vn,this._grip.matrixAutoUpdate=!1,this._grip.visible=!1,this._grip.hasLinearVelocity=!1,this._grip.linearVelocity=new I,this._grip.hasAngularVelocity=!1,this._grip.angularVelocity=new I,this._grip.eventsEnabled=!1),this._grip}dispatchEvent(t){return this._targetRay!==null&&this._targetRay.dispatchEvent(t),this._grip!==null&&this._grip.dispatchEvent(t),this._hand!==null&&this._hand.dispatchEvent(t),this}connect(t){if(t&&t.hand){const e=this._hand;if(e)for(const n of t.hand.values())this._getHandJoint(e,n)}return this.dispatchEvent({type:"connected",data:t}),this}disconnect(t){return this.dispatchEvent({type:"disconnected",data:t}),this._targetRay!==null&&(this._targetRay.visible=!1),this._grip!==null&&(this._grip.visible=!1),this._hand!==null&&(this._hand.visible=!1),this}update(t,e,n){let i=null,r=null,a=null;const o=this._targetRay,l=this._grip,c=this._hand;if(t&&e.session.visibilityState!=="visible-blurred"){if(c&&t.hand){a=!0;for(const _ of t.hand.values()){const g=e.getJointPose(_,n),m=this._getHandJoint(c,_);g!==null&&(m.matrix.fromArray(g.transform.matrix),m.matrix.decompose(m.position,m.rotation,m.scale),m.matrixWorldNeedsUpdate=!0,m.jointRadius=g.radius),m.visible=g!==null}const h=c.joints["index-finger-tip"],f=c.joints["thumb-tip"],u=h.position.distanceTo(f.position),d=.02,p=.005;c.inputState.pinching&&u>d+p?(c.inputState.pinching=!1,this.dispatchEvent({type:"pinchend",handedness:t.handedness,target:this})):!c.inputState.pinching&&u<=d-p&&(c.inputState.pinching=!0,this.dispatchEvent({type:"pinchstart",handedness:t.handedness,target:this}))}else l!==null&&t.gripSpace&&(r=e.getPose(t.gripSpace,n),r!==null&&(l.matrix.fromArray(r.transform.matrix),l.matrix.decompose(l.position,l.rotation,l.scale),l.matrixWorldNeedsUpdate=!0,r.linearVelocity?(l.hasLinearVelocity=!0,l.linearVelocity.copy(r.linearVelocity)):l.hasLinearVelocity=!1,r.angularVelocity?(l.hasAngularVelocity=!0,l.angularVelocity.copy(r.angularVelocity)):l.hasAngularVelocity=!1,l.eventsEnabled&&l.dispatchEvent({type:"gripUpdated",data:t,target:this})));o!==null&&(i=e.getPose(t.targetRaySpace,n),i===null&&r!==null&&(i=r),i!==null&&(o.matrix.fromArray(i.transform.matrix),o.matrix.decompose(o.position,o.rotation,o.scale),o.matrixWorldNeedsUpdate=!0,i.linearVelocity?(o.hasLinearVelocity=!0,o.linearVelocity.copy(i.linearVelocity)):o.hasLinearVelocity=!1,i.angularVelocity?(o.hasAngularVelocity=!0,o.angularVelocity.copy(i.angularVelocity)):o.hasAngularVelocity=!1,this.dispatchEvent(H0)))}return o!==null&&(o.visible=i!==null),l!==null&&(l.visible=r!==null),c!==null&&(c.visible=a!==null),this}_getHandJoint(t,e){if(t.joints[e.jointName]===void 0){const n=new vn;n.matrixAutoUpdate=!1,n.visible=!1,t.joints[e.jointName]=n,t.add(n)}return t.joints[e.jointName]}}const Cp={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074},zi={h:0,s:0,l:0},qa={h:0,s:0,l:0};function Uc(s,t,e){return e<0&&(e+=1),e>1&&(e-=1),e<1/6?s+(t-s)*6*e:e<1/2?t:e<2/3?s+(t-s)*6*(2/3-e):s}class ut{constructor(t,e,n){return this.isColor=!0,this.r=1,this.g=1,this.b=1,this.set(t,e,n)}set(t,e,n){if(e===void 0&&n===void 0){const i=t;i&&i.isColor?this.copy(i):typeof i=="number"?this.setHex(i):typeof i=="string"&&this.setStyle(i)}else this.setRGB(t,e,n);return this}setScalar(t){return this.r=t,this.g=t,this.b=t,this}setHex(t,e=cn){return t=Math.floor(t),this.r=(t>>16&255)/255,this.g=(t>>8&255)/255,this.b=(t&255)/255,ae.colorSpaceToWorking(this,e),this}setRGB(t,e,n,i=ae.workingColorSpace){return this.r=t,this.g=e,this.b=n,ae.colorSpaceToWorking(this,i),this}setHSL(t,e,n,i=ae.workingColorSpace){if(t=su(t,1),e=Ht(e,0,1),n=Ht(n,0,1),e===0)this.r=this.g=this.b=n;else{const r=n<=.5?n*(1+e):n+e-n*e,a=2*n-r;this.r=Uc(a,r,t+1/3),this.g=Uc(a,r,t),this.b=Uc(a,r,t-1/3)}return ae.colorSpaceToWorking(this,i),this}setStyle(t,e=cn){function n(r){r!==void 0&&parseFloat(r)<1&&pt("Color: Alpha component of "+t+" will be ignored.")}let i;if(i=/^(\w+)\(([^\)]*)\)/.exec(t)){let r;const a=i[1],o=i[2];switch(a){case"rgb":case"rgba":if(r=/^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(r[4]),this.setRGB(Math.min(255,parseInt(r[1],10))/255,Math.min(255,parseInt(r[2],10))/255,Math.min(255,parseInt(r[3],10))/255,e);if(r=/^\s*(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(r[4]),this.setRGB(Math.min(100,parseInt(r[1],10))/100,Math.min(100,parseInt(r[2],10))/100,Math.min(100,parseInt(r[3],10))/100,e);break;case"hsl":case"hsla":if(r=/^\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\%\s*,\s*(\d*\.?\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(r[4]),this.setHSL(parseFloat(r[1])/360,parseFloat(r[2])/100,parseFloat(r[3])/100,e);break;default:pt("Color: Unknown color model "+t)}}else if(i=/^\#([A-Fa-f\d]+)$/.exec(t)){const r=i[1],a=r.length;if(a===3)return this.setRGB(parseInt(r.charAt(0),16)/15,parseInt(r.charAt(1),16)/15,parseInt(r.charAt(2),16)/15,e);if(a===6)return this.setHex(parseInt(r,16),e);pt("Color: Invalid hex color "+t)}else if(t&&t.length>0)return this.setColorName(t,e);return this}setColorName(t,e=cn){const n=Cp[t.toLowerCase()];return n!==void 0?this.setHex(n,e):pt("Color: Unknown color "+t),this}clone(){return new this.constructor(this.r,this.g,this.b)}copy(t){return this.r=t.r,this.g=t.g,this.b=t.b,this}copySRGBToLinear(t){return this.r=Ri(t.r),this.g=Ri(t.g),this.b=Ri(t.b),this}copyLinearToSRGB(t){return this.r=hr(t.r),this.g=hr(t.g),this.b=hr(t.b),this}convertSRGBToLinear(){return this.copySRGBToLinear(this),this}convertLinearToSRGB(){return this.copyLinearToSRGB(this),this}getHex(t=cn){return ae.workingToColorSpace(Ke.copy(this),t),Math.round(Ht(Ke.r*255,0,255))*65536+Math.round(Ht(Ke.g*255,0,255))*256+Math.round(Ht(Ke.b*255,0,255))}getHexString(t=cn){return("000000"+this.getHex(t).toString(16)).slice(-6)}getHSL(t,e=ae.workingColorSpace){ae.workingToColorSpace(Ke.copy(this),e);const n=Ke.r,i=Ke.g,r=Ke.b,a=Math.max(n,i,r),o=Math.min(n,i,r);let l,c;const h=(o+a)/2;if(o===a)l=0,c=0;else{const f=a-o;switch(c=h<=.5?f/(a+o):f/(2-a-o),a){case n:l=(i-r)/f+(i<r?6:0);break;case i:l=(r-n)/f+2;break;case r:l=(n-i)/f+4;break}l/=6}return t.h=l,t.s=c,t.l=h,t}getRGB(t,e=ae.workingColorSpace){return ae.workingToColorSpace(Ke.copy(this),e),t.r=Ke.r,t.g=Ke.g,t.b=Ke.b,t}getStyle(t=cn){ae.workingToColorSpace(Ke.copy(this),t);const e=Ke.r,n=Ke.g,i=Ke.b;return t!==cn?`color(${t} ${e.toFixed(3)} ${n.toFixed(3)} ${i.toFixed(3)})`:`rgb(${Math.round(e*255)},${Math.round(n*255)},${Math.round(i*255)})`}offsetHSL(t,e,n){return this.getHSL(zi),this.setHSL(zi.h+t,zi.s+e,zi.l+n)}add(t){return this.r+=t.r,this.g+=t.g,this.b+=t.b,this}addColors(t,e){return this.r=t.r+e.r,this.g=t.g+e.g,this.b=t.b+e.b,this}addScalar(t){return this.r+=t,this.g+=t,this.b+=t,this}sub(t){return this.r=Math.max(0,this.r-t.r),this.g=Math.max(0,this.g-t.g),this.b=Math.max(0,this.b-t.b),this}multiply(t){return this.r*=t.r,this.g*=t.g,this.b*=t.b,this}multiplyScalar(t){return this.r*=t,this.g*=t,this.b*=t,this}lerp(t,e){return this.r+=(t.r-this.r)*e,this.g+=(t.g-this.g)*e,this.b+=(t.b-this.b)*e,this}lerpColors(t,e,n){return this.r=t.r+(e.r-t.r)*n,this.g=t.g+(e.g-t.g)*n,this.b=t.b+(e.b-t.b)*n,this}lerpHSL(t,e){this.getHSL(zi),t.getHSL(qa);const n=ca(zi.h,qa.h,e),i=ca(zi.s,qa.s,e),r=ca(zi.l,qa.l,e);return this.setHSL(n,i,r),this}setFromVector3(t){return this.r=t.x,this.g=t.y,this.b=t.z,this}applyMatrix3(t){const e=this.r,n=this.g,i=this.b,r=t.elements;return this.r=r[0]*e+r[3]*n+r[6]*i,this.g=r[1]*e+r[4]*n+r[7]*i,this.b=r[2]*e+r[5]*n+r[8]*i,this}equals(t){return t.r===this.r&&t.g===this.g&&t.b===this.b}fromArray(t,e=0){return this.r=t[e],this.g=t[e+1],this.b=t[e+2],this}toArray(t=[],e=0){return t[e]=this.r,t[e+1]=this.g,t[e+2]=this.b,t}fromBufferAttribute(t,e){return this.r=t.getX(e),this.g=t.getY(e),this.b=t.getZ(e),this}toJSON(){return this.getHex()}*[Symbol.iterator](){yield this.r,yield this.g,yield this.b}}const Ke=new ut;ut.NAMES=Cp;class Ua{constructor(t,e=25e-5){this.isFogExp2=!0,this.name="",this.color=new ut(t),this.density=e}clone(){return new Ua(this.color,this.density)}toJSON(){return{type:"FogExp2",name:this.name,color:this.color.getHex(),density:this.density}}}class tc{constructor(t,e=1,n=1e3){this.isFog=!0,this.name="",this.color=new ut(t),this.near=e,this.far=n}clone(){return new tc(this.color,this.near,this.far)}toJSON(){return{type:"Fog",name:this.name,color:this.color.getHex(),near:this.near,far:this.far}}}class au extends he{constructor(){super(),this.isScene=!0,this.type="Scene",this.background=null,this.environment=null,this.fog=null,this.backgroundBlurriness=0,this.backgroundIntensity=1,this.backgroundRotation=new $n,this.environmentIntensity=1,this.environmentRotation=new $n,this.overrideMaterial=null,typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}copy(t,e){return super.copy(t,e),t.background!==null&&(this.background=t.background.clone()),t.environment!==null&&(this.environment=t.environment.clone()),t.fog!==null&&(this.fog=t.fog.clone()),this.backgroundBlurriness=t.backgroundBlurriness,this.backgroundIntensity=t.backgroundIntensity,this.backgroundRotation.copy(t.backgroundRotation),this.environmentIntensity=t.environmentIntensity,this.environmentRotation.copy(t.environmentRotation),t.overrideMaterial!==null&&(this.overrideMaterial=t.overrideMaterial.clone()),this.matrixAutoUpdate=t.matrixAutoUpdate,this}toJSON(t){const e=super.toJSON(t);return this.fog!==null&&(e.object.fog=this.fog.toJSON()),e.object.backgroundBlurriness=this.backgroundBlurriness,e.object.backgroundIntensity=this.backgroundIntensity,e.object.backgroundRotation=this.backgroundRotation.toArray(),e.object.environmentIntensity=this.environmentIntensity,e.object.environmentRotation=this.environmentRotation.toArray(),e}}const kn=new I,pi=new I,Fc=new I,mi=new I,ks=new I,Vs=new I,md=new I,Oc=new I,Bc=new I,zc=new I,kc=new xe,Vc=new xe,Gc=new xe;class xn{constructor(t=new I,e=new I,n=new I){this.a=t,this.b=e,this.c=n}static getNormal(t,e,n,i){i.subVectors(n,e),kn.subVectors(t,e),i.cross(kn);const r=i.lengthSq();return r>0?i.multiplyScalar(1/Math.sqrt(r)):i.set(0,0,0)}static getBarycoord(t,e,n,i,r){kn.subVectors(i,e),pi.subVectors(n,e),Fc.subVectors(t,e);const a=kn.dot(kn),o=kn.dot(pi),l=kn.dot(Fc),c=pi.dot(pi),h=pi.dot(Fc),f=a*c-o*o;if(f===0)return r.set(0,0,0),null;const u=1/f,d=(c*l-o*h)*u,p=(a*h-o*l)*u;return r.set(1-d-p,p,d)}static containsPoint(t,e,n,i){return this.getBarycoord(t,e,n,i,mi)===null?!1:mi.x>=0&&mi.y>=0&&mi.x+mi.y<=1}static getInterpolation(t,e,n,i,r,a,o,l){return this.getBarycoord(t,e,n,i,mi)===null?(l.x=0,l.y=0,"z"in l&&(l.z=0),"w"in l&&(l.w=0),null):(l.setScalar(0),l.addScaledVector(r,mi.x),l.addScaledVector(a,mi.y),l.addScaledVector(o,mi.z),l)}static getInterpolatedAttribute(t,e,n,i,r,a){return kc.setScalar(0),Vc.setScalar(0),Gc.setScalar(0),kc.fromBufferAttribute(t,e),Vc.fromBufferAttribute(t,n),Gc.fromBufferAttribute(t,i),a.setScalar(0),a.addScaledVector(kc,r.x),a.addScaledVector(Vc,r.y),a.addScaledVector(Gc,r.z),a}static isFrontFacing(t,e,n,i){return kn.subVectors(n,e),pi.subVectors(t,e),kn.cross(pi).dot(i)<0}set(t,e,n){return this.a.copy(t),this.b.copy(e),this.c.copy(n),this}setFromPointsAndIndices(t,e,n,i){return this.a.copy(t[e]),this.b.copy(t[n]),this.c.copy(t[i]),this}setFromAttributeAndIndices(t,e,n,i){return this.a.fromBufferAttribute(t,e),this.b.fromBufferAttribute(t,n),this.c.fromBufferAttribute(t,i),this}clone(){return new this.constructor().copy(this)}copy(t){return this.a.copy(t.a),this.b.copy(t.b),this.c.copy(t.c),this}getArea(){return kn.subVectors(this.c,this.b),pi.subVectors(this.a,this.b),kn.cross(pi).length()*.5}getMidpoint(t){return t.addVectors(this.a,this.b).add(this.c).multiplyScalar(1/3)}getNormal(t){return xn.getNormal(this.a,this.b,this.c,t)}getPlane(t){return t.setFromCoplanarPoints(this.a,this.b,this.c)}getBarycoord(t,e){return xn.getBarycoord(t,this.a,this.b,this.c,e)}getInterpolation(t,e,n,i,r){return xn.getInterpolation(t,this.a,this.b,this.c,e,n,i,r)}containsPoint(t){return xn.containsPoint(t,this.a,this.b,this.c)}isFrontFacing(t){return xn.isFrontFacing(this.a,this.b,this.c,t)}intersectsBox(t){return t.intersectsTriangle(this)}closestPointToPoint(t,e){const n=this.a,i=this.b,r=this.c;let a,o;ks.subVectors(i,n),Vs.subVectors(r,n),Oc.subVectors(t,n);const l=ks.dot(Oc),c=Vs.dot(Oc);if(l<=0&&c<=0)return e.copy(n);Bc.subVectors(t,i);const h=ks.dot(Bc),f=Vs.dot(Bc);if(h>=0&&f<=h)return e.copy(i);const u=l*f-h*c;if(u<=0&&l>=0&&h<=0)return a=l/(l-h),e.copy(n).addScaledVector(ks,a);zc.subVectors(t,r);const d=ks.dot(zc),p=Vs.dot(zc);if(p>=0&&d<=p)return e.copy(r);const _=d*c-l*p;if(_<=0&&c>=0&&p<=0)return o=c/(c-p),e.copy(n).addScaledVector(Vs,o);const g=h*p-d*f;if(g<=0&&f-h>=0&&d-p>=0)return md.subVectors(r,i),o=(f-h)/(f-h+(d-p)),e.copy(i).addScaledVector(md,o);const m=1/(g+_+u);return a=_*m,o=u*m,e.copy(n).addScaledVector(ks,a).addScaledVector(Vs,o)}equals(t){return t.a.equals(this.a)&&t.b.equals(this.b)&&t.c.equals(this.c)}}class rn{constructor(t=new I(1/0,1/0,1/0),e=new I(-1/0,-1/0,-1/0)){this.isBox3=!0,this.min=t,this.max=e}set(t,e){return this.min.copy(t),this.max.copy(e),this}setFromArray(t){this.makeEmpty();for(let e=0,n=t.length;e<n;e+=3)this.expandByPoint(Vn.fromArray(t,e));return this}setFromBufferAttribute(t){this.makeEmpty();for(let e=0,n=t.count;e<n;e++)this.expandByPoint(Vn.fromBufferAttribute(t,e));return this}setFromPoints(t){this.makeEmpty();for(let e=0,n=t.length;e<n;e++)this.expandByPoint(t[e]);return this}setFromCenterAndSize(t,e){const n=Vn.copy(e).multiplyScalar(.5);return this.min.copy(t).sub(n),this.max.copy(t).add(n),this}setFromObject(t,e=!1){return this.makeEmpty(),this.expandByObject(t,e)}clone(){return new this.constructor().copy(this)}copy(t){return this.min.copy(t.min),this.max.copy(t.max),this}makeEmpty(){return this.min.x=this.min.y=this.min.z=1/0,this.max.x=this.max.y=this.max.z=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y||this.max.z<this.min.z}getCenter(t){return this.isEmpty()?t.set(0,0,0):t.addVectors(this.min,this.max).multiplyScalar(.5)}getSize(t){return this.isEmpty()?t.set(0,0,0):t.subVectors(this.max,this.min)}expandByPoint(t){return this.min.min(t),this.max.max(t),this}expandByVector(t){return this.min.sub(t),this.max.add(t),this}expandByScalar(t){return this.min.addScalar(-t),this.max.addScalar(t),this}expandByObject(t,e=!1){t.updateWorldMatrix(!1,!1);const n=t.geometry;if(n!==void 0){const r=n.getAttribute("position");if(e===!0&&r!==void 0&&t.isInstancedMesh!==!0)for(let a=0,o=r.count;a<o;a++)t.isMesh===!0?t.getVertexPosition(a,Vn):Vn.fromBufferAttribute(r,a),Vn.applyMatrix4(t.matrixWorld),this.expandByPoint(Vn);else t.boundingBox!==void 0?(t.boundingBox===null&&t.computeBoundingBox(),Ya.copy(t.boundingBox)):(n.boundingBox===null&&n.computeBoundingBox(),Ya.copy(n.boundingBox)),Ya.applyMatrix4(t.matrixWorld),this.union(Ya)}const i=t.children;for(let r=0,a=i.length;r<a;r++)this.expandByObject(i[r],e);return this}containsPoint(t){return t.x>=this.min.x&&t.x<=this.max.x&&t.y>=this.min.y&&t.y<=this.max.y&&t.z>=this.min.z&&t.z<=this.max.z}containsBox(t){return this.min.x<=t.min.x&&t.max.x<=this.max.x&&this.min.y<=t.min.y&&t.max.y<=this.max.y&&this.min.z<=t.min.z&&t.max.z<=this.max.z}getParameter(t,e){return e.set((t.x-this.min.x)/(this.max.x-this.min.x),(t.y-this.min.y)/(this.max.y-this.min.y),(t.z-this.min.z)/(this.max.z-this.min.z))}intersectsBox(t){return t.max.x>=this.min.x&&t.min.x<=this.max.x&&t.max.y>=this.min.y&&t.min.y<=this.max.y&&t.max.z>=this.min.z&&t.min.z<=this.max.z}intersectsSphere(t){return this.clampPoint(t.center,Vn),Vn.distanceToSquared(t.center)<=t.radius*t.radius}intersectsPlane(t){let e,n;return t.normal.x>0?(e=t.normal.x*this.min.x,n=t.normal.x*this.max.x):(e=t.normal.x*this.max.x,n=t.normal.x*this.min.x),t.normal.y>0?(e+=t.normal.y*this.min.y,n+=t.normal.y*this.max.y):(e+=t.normal.y*this.max.y,n+=t.normal.y*this.min.y),t.normal.z>0?(e+=t.normal.z*this.min.z,n+=t.normal.z*this.max.z):(e+=t.normal.z*this.max.z,n+=t.normal.z*this.min.z),e<=-t.constant&&n>=-t.constant}intersectsTriangle(t){if(this.isEmpty())return!1;this.getCenter(Pr),Za.subVectors(this.max,Pr),Gs.subVectors(t.a,Pr),Hs.subVectors(t.b,Pr),Ws.subVectors(t.c,Pr),ki.subVectors(Hs,Gs),Vi.subVectors(Ws,Hs),ss.subVectors(Gs,Ws);let e=[0,-ki.z,ki.y,0,-Vi.z,Vi.y,0,-ss.z,ss.y,ki.z,0,-ki.x,Vi.z,0,-Vi.x,ss.z,0,-ss.x,-ki.y,ki.x,0,-Vi.y,Vi.x,0,-ss.y,ss.x,0];return!Hc(e,Gs,Hs,Ws,Za)||(e=[1,0,0,0,1,0,0,0,1],!Hc(e,Gs,Hs,Ws,Za))?!1:($a.crossVectors(ki,Vi),e=[$a.x,$a.y,$a.z],Hc(e,Gs,Hs,Ws,Za))}clampPoint(t,e){return e.copy(t).clamp(this.min,this.max)}distanceToPoint(t){return this.clampPoint(t,Vn).distanceTo(t)}getBoundingSphere(t){return this.isEmpty()?t.makeEmpty():(this.getCenter(t.center),t.radius=this.getSize(Vn).length()*.5),t}intersect(t){return this.min.max(t.min),this.max.min(t.max),this.isEmpty()&&this.makeEmpty(),this}union(t){return this.min.min(t.min),this.max.max(t.max),this}applyMatrix4(t){return this.isEmpty()?this:(gi[0].set(this.min.x,this.min.y,this.min.z).applyMatrix4(t),gi[1].set(this.min.x,this.min.y,this.max.z).applyMatrix4(t),gi[2].set(this.min.x,this.max.y,this.min.z).applyMatrix4(t),gi[3].set(this.min.x,this.max.y,this.max.z).applyMatrix4(t),gi[4].set(this.max.x,this.min.y,this.min.z).applyMatrix4(t),gi[5].set(this.max.x,this.min.y,this.max.z).applyMatrix4(t),gi[6].set(this.max.x,this.max.y,this.min.z).applyMatrix4(t),gi[7].set(this.max.x,this.max.y,this.max.z).applyMatrix4(t),this.setFromPoints(gi),this)}translate(t){return this.min.add(t),this.max.add(t),this}equals(t){return t.min.equals(this.min)&&t.max.equals(this.max)}toJSON(){return{min:this.min.toArray(),max:this.max.toArray()}}fromJSON(t){return this.min.fromArray(t.min),this.max.fromArray(t.max),this}}const gi=[new I,new I,new I,new I,new I,new I,new I,new I],Vn=new I,Ya=new rn,Gs=new I,Hs=new I,Ws=new I,ki=new I,Vi=new I,ss=new I,Pr=new I,Za=new I,$a=new I,rs=new I;function Hc(s,t,e,n,i){for(let r=0,a=s.length-3;r<=a;r+=3){rs.fromArray(s,r);const o=i.x*Math.abs(rs.x)+i.y*Math.abs(rs.y)+i.z*Math.abs(rs.z),l=t.dot(rs),c=e.dot(rs),h=n.dot(rs);if(Math.max(-Math.max(l,c,h),Math.min(l,c,h))>o)return!1}return!0}const bi=W0();function W0(){const s=new ArrayBuffer(4),t=new Float32Array(s),e=new Uint32Array(s),n=new Uint32Array(512),i=new Uint32Array(512);for(let l=0;l<256;++l){const c=l-127;c<-27?(n[l]=0,n[l|256]=32768,i[l]=24,i[l|256]=24):c<-14?(n[l]=1024>>-c-14,n[l|256]=1024>>-c-14|32768,i[l]=-c-1,i[l|256]=-c-1):c<=15?(n[l]=c+15<<10,n[l|256]=c+15<<10|32768,i[l]=13,i[l|256]=13):c<128?(n[l]=31744,n[l|256]=64512,i[l]=24,i[l|256]=24):(n[l]=31744,n[l|256]=64512,i[l]=13,i[l|256]=13)}const r=new Uint32Array(2048),a=new Uint32Array(64),o=new Uint32Array(64);for(let l=1;l<1024;++l){let c=l<<13,h=0;for(;(c&8388608)===0;)c<<=1,h-=8388608;c&=-8388609,h+=947912704,r[l]=c|h}for(let l=1024;l<2048;++l)r[l]=939524096+(l-1024<<13);for(let l=1;l<31;++l)a[l]=l<<23;a[31]=1199570944,a[32]=2147483648;for(let l=33;l<63;++l)a[l]=2147483648+(l-32<<23);a[63]=3347054592;for(let l=1;l<64;++l)l!==32&&(o[l]=1024);return{floatView:t,uint32View:e,baseTable:n,shiftTable:i,mantissaTable:r,exponentTable:a,offsetTable:o}}function gn(s){Math.abs(s)>65504&&pt("DataUtils.toHalfFloat(): Value out of range."),s=Ht(s,-65504,65504),bi.floatView[0]=s;const t=bi.uint32View[0],e=t>>23&511;return bi.baseTable[e]+((t&8388607)>>bi.shiftTable[e])}function $r(s){const t=s>>10;return bi.uint32View[0]=bi.mantissaTable[bi.offsetTable[t]+(s&1023)]+bi.exponentTable[t],bi.floatView[0]}class X0{static toHalfFloat(t){return gn(t)}static fromHalfFloat(t){return $r(t)}}const ke=new I,Ja=new it;let q0=0;class ue extends Jn{constructor(t,e,n=!1){if(super(),Array.isArray(t))throw new TypeError("THREE.BufferAttribute: array should be a Typed Array.");this.isBufferAttribute=!0,Object.defineProperty(this,"id",{value:q0++}),this.name="",this.array=t,this.itemSize=e,this.count=t!==void 0?t.length/e:0,this.normalized=n,this.usage=Jl,this.updateRanges=[],this.gpuType=un,this.version=0}onUploadCallback(){}set needsUpdate(t){t===!0&&this.version++}setUsage(t){return this.usage=t,this}addUpdateRange(t,e){this.updateRanges.push({start:t,count:e})}clearUpdateRanges(){this.updateRanges.length=0}copy(t){return this.name=t.name,this.array=new t.array.constructor(t.array),this.itemSize=t.itemSize,this.count=t.count,this.normalized=t.normalized,this.usage=t.usage,this.gpuType=t.gpuType,this}copyAt(t,e,n){t*=this.itemSize,n*=e.itemSize;for(let i=0,r=this.itemSize;i<r;i++)this.array[t+i]=e.array[n+i];return this}copyArray(t){return this.array.set(t),this}applyMatrix3(t){if(this.itemSize===2)for(let e=0,n=this.count;e<n;e++)Ja.fromBufferAttribute(this,e),Ja.applyMatrix3(t),this.setXY(e,Ja.x,Ja.y);else if(this.itemSize===3)for(let e=0,n=this.count;e<n;e++)ke.fromBufferAttribute(this,e),ke.applyMatrix3(t),this.setXYZ(e,ke.x,ke.y,ke.z);return this}applyMatrix4(t){for(let e=0,n=this.count;e<n;e++)ke.fromBufferAttribute(this,e),ke.applyMatrix4(t),this.setXYZ(e,ke.x,ke.y,ke.z);return this}applyNormalMatrix(t){for(let e=0,n=this.count;e<n;e++)ke.fromBufferAttribute(this,e),ke.applyNormalMatrix(t),this.setXYZ(e,ke.x,ke.y,ke.z);return this}transformDirection(t){for(let e=0,n=this.count;e<n;e++)ke.fromBufferAttribute(this,e),ke.transformDirection(t),this.setXYZ(e,ke.x,ke.y,ke.z);return this}set(t,e=0){return this.array.set(t,e),this}getComponent(t,e){let n=this.array[t*this.itemSize+e];return this.normalized&&(n=hn(n,this.array)),n}setComponent(t,e,n){return this.normalized&&(n=te(n,this.array)),this.array[t*this.itemSize+e]=n,this}getX(t){let e=this.array[t*this.itemSize];return this.normalized&&(e=hn(e,this.array)),e}setX(t,e){return this.normalized&&(e=te(e,this.array)),this.array[t*this.itemSize]=e,this}getY(t){let e=this.array[t*this.itemSize+1];return this.normalized&&(e=hn(e,this.array)),e}setY(t,e){return this.normalized&&(e=te(e,this.array)),this.array[t*this.itemSize+1]=e,this}getZ(t){let e=this.array[t*this.itemSize+2];return this.normalized&&(e=hn(e,this.array)),e}setZ(t,e){return this.normalized&&(e=te(e,this.array)),this.array[t*this.itemSize+2]=e,this}getW(t){let e=this.array[t*this.itemSize+3];return this.normalized&&(e=hn(e,this.array)),e}setW(t,e){return this.normalized&&(e=te(e,this.array)),this.array[t*this.itemSize+3]=e,this}setXY(t,e,n){return t*=this.itemSize,this.normalized&&(e=te(e,this.array),n=te(n,this.array)),this.array[t+0]=e,this.array[t+1]=n,this}setXYZ(t,e,n,i){return t*=this.itemSize,this.normalized&&(e=te(e,this.array),n=te(n,this.array),i=te(i,this.array)),this.array[t+0]=e,this.array[t+1]=n,this.array[t+2]=i,this}setXYZW(t,e,n,i,r){return t*=this.itemSize,this.normalized&&(e=te(e,this.array),n=te(n,this.array),i=te(i,this.array),r=te(r,this.array)),this.array[t+0]=e,this.array[t+1]=n,this.array[t+2]=i,this.array[t+3]=r,this}onUpload(t){return this.onUploadCallback=t,this}clone(){return new this.constructor(this.array,this.itemSize).copy(this)}toJSON(){const t={itemSize:this.itemSize,type:this.array.constructor.name,array:Array.from(this.array),normalized:this.normalized};return t.name=this.name,t.usage=this.usage,t.gpuType=this.gpuType,t}dispose(){this.dispatchEvent({type:"dispose"})}}class Y0 extends ue{constructor(t,e,n){super(new Int8Array(t),e,n)}}class Z0 extends ue{constructor(t,e,n){super(new Uint8Array(t),e,n)}}class $0 extends ue{constructor(t,e,n){super(new Uint8ClampedArray(t),e,n)}}class J0 extends ue{constructor(t,e,n){super(new Int16Array(t),e,n)}}class ou extends ue{constructor(t,e,n){super(new Uint16Array(t),e,n)}}class K0 extends ue{constructor(t,e,n){super(new Int32Array(t),e,n)}}class lu extends ue{constructor(t,e,n){super(new Uint32Array(t),e,n)}}class Q0 extends ue{constructor(t,e,n){super(new Uint16Array(t),e,n),this.isFloat16BufferAttribute=!0}getX(t){let e=$r(this.array[t*this.itemSize]);return this.normalized&&(e=hn(e,this.array)),e}setX(t,e){return this.normalized&&(e=te(e,this.array)),this.array[t*this.itemSize]=gn(e),this}getY(t){let e=$r(this.array[t*this.itemSize+1]);return this.normalized&&(e=hn(e,this.array)),e}setY(t,e){return this.normalized&&(e=te(e,this.array)),this.array[t*this.itemSize+1]=gn(e),this}getZ(t){let e=$r(this.array[t*this.itemSize+2]);return this.normalized&&(e=hn(e,this.array)),e}setZ(t,e){return this.normalized&&(e=te(e,this.array)),this.array[t*this.itemSize+2]=gn(e),this}getW(t){let e=$r(this.array[t*this.itemSize+3]);return this.normalized&&(e=hn(e,this.array)),e}setW(t,e){return this.normalized&&(e=te(e,this.array)),this.array[t*this.itemSize+3]=gn(e),this}setXY(t,e,n){return t*=this.itemSize,this.normalized&&(e=te(e,this.array),n=te(n,this.array)),this.array[t+0]=gn(e),this.array[t+1]=gn(n),this}setXYZ(t,e,n,i){return t*=this.itemSize,this.normalized&&(e=te(e,this.array),n=te(n,this.array),i=te(i,this.array)),this.array[t+0]=gn(e),this.array[t+1]=gn(n),this.array[t+2]=gn(i),this}setXYZW(t,e,n,i,r){return t*=this.itemSize,this.normalized&&(e=te(e,this.array),n=te(n,this.array),i=te(i,this.array),r=te(r,this.array)),this.array[t+0]=gn(e),this.array[t+1]=gn(n),this.array[t+2]=gn(i),this.array[t+3]=gn(r),this}}class Mt extends ue{constructor(t,e,n){super(new Float32Array(t),e,n)}}const j0=new rn,Lr=new I,Wc=new I;class Ye{constructor(t=new I,e=-1){this.isSphere=!0,this.center=t,this.radius=e}set(t,e){return this.center.copy(t),this.radius=e,this}setFromPoints(t,e){const n=this.center;e!==void 0?n.copy(e):j0.setFromPoints(t).getCenter(n);let i=0;for(let r=0,a=t.length;r<a;r++)i=Math.max(i,n.distanceToSquared(t[r]));return this.radius=Math.sqrt(i),this}copy(t){return this.center.copy(t.center),this.radius=t.radius,this}isEmpty(){return this.radius<0}makeEmpty(){return this.center.set(0,0,0),this.radius=-1,this}containsPoint(t){return t.distanceToSquared(this.center)<=this.radius*this.radius}distanceToPoint(t){return t.distanceTo(this.center)-this.radius}intersectsSphere(t){const e=this.radius+t.radius;return t.center.distanceToSquared(this.center)<=e*e}intersectsBox(t){return t.intersectsSphere(this)}intersectsPlane(t){return Math.abs(t.distanceToPoint(this.center))<=this.radius}clampPoint(t,e){const n=this.center.distanceToSquared(t);return e.copy(t),n>this.radius*this.radius&&(e.sub(this.center).normalize(),e.multiplyScalar(this.radius).add(this.center)),e}getBoundingBox(t){return this.isEmpty()?(t.makeEmpty(),t):(t.set(this.center,this.center),t.expandByScalar(this.radius),t)}applyMatrix4(t){return this.center.applyMatrix4(t),this.radius=this.radius*t.getMaxScaleOnAxis(),this}translate(t){return this.center.add(t),this}expandByPoint(t){if(this.isEmpty())return this.center.copy(t),this.radius=0,this;Lr.subVectors(t,this.center);const e=Lr.lengthSq();if(e>this.radius*this.radius){const n=Math.sqrt(e),i=(n-this.radius)*.5;this.center.addScaledVector(Lr,i/n),this.radius+=i}return this}union(t){return t.isEmpty()?this:this.isEmpty()?(this.copy(t),this):(this.center.equals(t.center)===!0?this.radius=Math.max(this.radius,t.radius):(Wc.subVectors(t.center,this.center).setLength(t.radius),this.expandByPoint(Lr.copy(t.center).add(Wc)),this.expandByPoint(Lr.copy(t.center).sub(Wc))),this)}equals(t){return t.center.equals(this.center)&&t.radius===this.radius}clone(){return new this.constructor().copy(this)}toJSON(){return{radius:this.radius,center:this.center.toArray()}}fromJSON(t){return this.radius=t.radius,this.center.fromArray(t.center),this}}let t_=0;const Pn=new Yt,Xc=new he,Xs=new I,wn=new rn,Dr=new rn,We=new I;class Zt extends Jn{constructor(){super(),this.isBufferGeometry=!0,Object.defineProperty(this,"id",{value:t_++}),this.uuid=Cn(),this.name="",this.type="BufferGeometry",this.index=null,this.indirect=null,this.indirectOffset=0,this.attributes={},this.morphAttributes={},this.morphTargetsRelative=!1,this.groups=[],this.boundingBox=null,this.boundingSphere=null,this.drawRange={start:0,count:1/0},this.userData={},this._transformed=!1}getIndex(){return this.index}setIndex(t){return Array.isArray(t)?this.index=new(c0(t)?lu:ou)(t,1):this.index=t,this}setIndirect(t,e=0){return this.indirect=t,this.indirectOffset=e,this}getIndirect(){return this.indirect}getAttribute(t){return this.attributes[t]}setAttribute(t,e){return this.attributes[t]=e,this}deleteAttribute(t){return delete this.attributes[t],this}hasAttribute(t){return this.attributes[t]!==void 0}addGroup(t,e,n=0){this.groups.push({start:t,count:e,materialIndex:n})}clearGroups(){this.groups=[]}setDrawRange(t,e){this.drawRange.start=t,this.drawRange.count=e}applyMatrix4(t){const e=this.attributes.position;e!==void 0&&(e.applyMatrix4(t),e.needsUpdate=!0);const n=this.attributes.normal;if(n!==void 0){const r=new Jt().getNormalMatrix(t);n.applyNormalMatrix(r),n.needsUpdate=!0}const i=this.attributes.tangent;return i!==void 0&&(i.transformDirection(t),i.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this._transformed=!0,this}applyQuaternion(t){return Pn.makeRotationFromQuaternion(t),this.applyMatrix4(Pn),this}rotateX(t){return Pn.makeRotationX(t),this.applyMatrix4(Pn),this}rotateY(t){return Pn.makeRotationY(t),this.applyMatrix4(Pn),this}rotateZ(t){return Pn.makeRotationZ(t),this.applyMatrix4(Pn),this}translate(t,e,n){return Pn.makeTranslation(t,e,n),this.applyMatrix4(Pn),this}scale(t,e,n){return Pn.makeScale(t,e,n),this.applyMatrix4(Pn),this}lookAt(t){return Xc.lookAt(t),Xc.updateMatrix(),this.applyMatrix4(Xc.matrix),this}center(){return this.computeBoundingBox(),this.boundingBox.getCenter(Xs).negate(),this.translate(Xs.x,Xs.y,Xs.z),this}setFromPoints(t){const e=this.getAttribute("position");if(e===void 0){const n=[];for(let i=0,r=t.length;i<r;i++){const a=t[i];n.push(a.x,a.y,a.z||0)}this.setAttribute("position",new Mt(n,3))}else{const n=Math.min(t.length,e.count);for(let i=0;i<n;i++){const r=t[i];e.setXYZ(i,r.x,r.y,r.z||0)}t.length>e.count&&pt("BufferGeometry: Buffer size too small for points data. Use .dispose() and create a new geometry."),e.needsUpdate=!0}return this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new rn);const t=this.attributes.position,e=this.morphAttributes.position;if(t&&t.isGLBufferAttribute){Nt("BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box.",this),this.boundingBox.set(new I(-1/0,-1/0,-1/0),new I(1/0,1/0,1/0));return}if(t!==void 0){if(this.boundingBox.setFromBufferAttribute(t),e)for(let n=0,i=e.length;n<i;n++){const r=e[n];wn.setFromBufferAttribute(r),this.morphTargetsRelative?(We.addVectors(this.boundingBox.min,wn.min),this.boundingBox.expandByPoint(We),We.addVectors(this.boundingBox.max,wn.max),this.boundingBox.expandByPoint(We)):(this.boundingBox.expandByPoint(wn.min),this.boundingBox.expandByPoint(wn.max))}}else this.boundingBox.makeEmpty();(isNaN(this.boundingBox.min.x)||isNaN(this.boundingBox.min.y)||isNaN(this.boundingBox.min.z))&&Nt('BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.',this)}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new Ye);const t=this.attributes.position,e=this.morphAttributes.position;if(t&&t.isGLBufferAttribute){Nt("BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere.",this),this.boundingSphere.set(new I,1/0);return}if(t){const n=this.boundingSphere.center;if(wn.setFromBufferAttribute(t),e)for(let r=0,a=e.length;r<a;r++){const o=e[r];Dr.setFromBufferAttribute(o),this.morphTargetsRelative?(We.addVectors(wn.min,Dr.min),wn.expandByPoint(We),We.addVectors(wn.max,Dr.max),wn.expandByPoint(We)):(wn.expandByPoint(Dr.min),wn.expandByPoint(Dr.max))}wn.getCenter(n);let i=0;for(let r=0,a=t.count;r<a;r++)We.fromBufferAttribute(t,r),i=Math.max(i,n.distanceToSquared(We));if(e)for(let r=0,a=e.length;r<a;r++){const o=e[r],l=this.morphTargetsRelative;for(let c=0,h=o.count;c<h;c++)We.fromBufferAttribute(o,c),l&&(Xs.fromBufferAttribute(t,c),We.add(Xs)),i=Math.max(i,n.distanceToSquared(We))}this.boundingSphere.radius=Math.sqrt(i),isNaN(this.boundingSphere.radius)&&Nt('BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.',this)}}computeTangents(){const t=this.index,e=this.attributes;if(t===null||e.position===void 0||e.normal===void 0||e.uv===void 0){Nt("BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)");return}const n=e.position,i=e.normal,r=e.uv;let a=this.getAttribute("tangent");(a===void 0||a.count!==n.count)&&(a=new ue(new Float32Array(4*n.count),4),this.setAttribute("tangent",a));const o=[],l=[];for(let v=0;v<n.count;v++)o[v]=new I,l[v]=new I;const c=new I,h=new I,f=new I,u=new it,d=new it,p=new it,_=new I,g=new I;function m(v,T,C){c.fromBufferAttribute(n,v),h.fromBufferAttribute(n,T),f.fromBufferAttribute(n,C),u.fromBufferAttribute(r,v),d.fromBufferAttribute(r,T),p.fromBufferAttribute(r,C),h.sub(c),f.sub(c),d.sub(u),p.sub(u);const P=1/(d.x*p.y-p.x*d.y);isFinite(P)&&(_.copy(h).multiplyScalar(p.y).addScaledVector(f,-d.y).multiplyScalar(P),g.copy(f).multiplyScalar(d.x).addScaledVector(h,-p.x).multiplyScalar(P),o[v].add(_),o[T].add(_),o[C].add(_),l[v].add(g),l[T].add(g),l[C].add(g))}let x=this.groups;x.length===0&&(x=[{start:0,count:t.count}]);for(let v=0,T=x.length;v<T;++v){const C=x[v],P=C.start,L=C.count;for(let N=P,D=P+L;N<D;N+=3)m(t.getX(N+0),t.getX(N+1),t.getX(N+2))}const M=new I,y=new I,w=new I,b=new I;function E(v){w.fromBufferAttribute(i,v),b.copy(w);const T=o[v];M.copy(T),M.sub(w.multiplyScalar(w.dot(T))).normalize(),y.crossVectors(b,T);const P=y.dot(l[v])<0?-1:1;a.setXYZW(v,M.x,M.y,M.z,P)}for(let v=0,T=x.length;v<T;++v){const C=x[v],P=C.start,L=C.count;for(let N=P,D=P+L;N<D;N+=3)E(t.getX(N+0)),E(t.getX(N+1)),E(t.getX(N+2))}this._transformed=!0}computeVertexNormals(){const t=this.index,e=this.getAttribute("position");if(e!==void 0){let n=this.getAttribute("normal");if(n===void 0||n.count!==e.count)n=new ue(new Float32Array(e.count*3),3),this.setAttribute("normal",n);else for(let u=0,d=n.count;u<d;u++)n.setXYZ(u,0,0,0);const i=new I,r=new I,a=new I,o=new I,l=new I,c=new I,h=new I,f=new I;if(t)for(let u=0,d=t.count;u<d;u+=3){const p=t.getX(u+0),_=t.getX(u+1),g=t.getX(u+2);i.fromBufferAttribute(e,p),r.fromBufferAttribute(e,_),a.fromBufferAttribute(e,g),h.subVectors(a,r),f.subVectors(i,r),h.cross(f),o.fromBufferAttribute(n,p),l.fromBufferAttribute(n,_),c.fromBufferAttribute(n,g),o.add(h),l.add(h),c.add(h),n.setXYZ(p,o.x,o.y,o.z),n.setXYZ(_,l.x,l.y,l.z),n.setXYZ(g,c.x,c.y,c.z)}else for(let u=0,d=e.count;u<d;u+=3)i.fromBufferAttribute(e,u+0),r.fromBufferAttribute(e,u+1),a.fromBufferAttribute(e,u+2),h.subVectors(a,r),f.subVectors(i,r),h.cross(f),n.setXYZ(u+0,h.x,h.y,h.z),n.setXYZ(u+1,h.x,h.y,h.z),n.setXYZ(u+2,h.x,h.y,h.z);this.normalizeNormals(),n.needsUpdate=!0}}normalizeNormals(){const t=this.attributes.normal;for(let e=0,n=t.count;e<n;e++)We.fromBufferAttribute(t,e),We.normalize(),t.setXYZ(e,We.x,We.y,We.z)}toNonIndexed(){function t(o,l){const c=o.array,h=o.itemSize,f=o.normalized,u=new c.constructor(l.length*h);let d=0,p=0;for(let _=0,g=l.length;_<g;_++){o.isInterleavedBufferAttribute?d=l[_]*o.data.stride+o.offset:d=l[_]*h;for(let m=0;m<h;m++)u[p++]=c[d++]}return new ue(u,h,f)}if(this.index===null)return pt("BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed."),this;const e=new Zt,n=this.index.array,i=this.attributes;for(const o in i){const l=i[o],c=t(l,n);e.setAttribute(o,c)}const r=this.morphAttributes;for(const o in r){const l=[],c=r[o];for(let h=0,f=c.length;h<f;h++){const u=c[h],d=t(u,n);l.push(d)}e.morphAttributes[o]=l}e.morphTargetsRelative=this.morphTargetsRelative;const a=this.groups;for(let o=0,l=a.length;o<l;o++){const c=a[o];e.addGroup(c.start,c.count,c.materialIndex)}return e}toJSON(){const t={metadata:{version:4.7,type:"BufferGeometry",generator:"BufferGeometry.toJSON"}};if(t.uuid=this.uuid,t.type=this.parameters!==void 0&&this._transformed===!0?"BufferGeometry":this.type,t.name=this.name,Object.keys(this.userData).length>0&&(t.userData=this.userData),this.parameters!==void 0&&this._transformed!==!0){const l=this.parameters;for(const c in l)l[c]!==void 0&&(t[c]=l[c]);return t}t.data={attributes:{}};const e=this.index;e!==null&&(t.data.index={type:e.array.constructor.name,array:Array.prototype.slice.call(e.array)});const n=this.attributes;for(const l in n){const c=n[l];t.data.attributes[l]=c.toJSON(t.data)}const i={};let r=!1;for(const l in this.morphAttributes){const c=this.morphAttributes[l],h=[];for(let f=0,u=c.length;f<u;f++){const d=c[f];h.push(d.toJSON(t.data))}h.length>0&&(i[l]=h,r=!0)}r&&(t.data.morphAttributes=i,t.data.morphTargetsRelative=this.morphTargetsRelative);const a=this.groups;a.length>0&&(t.data.groups=JSON.parse(JSON.stringify(a)));const o=this.boundingSphere;return o!==null&&(t.data.boundingSphere=o.toJSON()),t}clone(){return new this.constructor().copy(this)}copy(t){this.index=null,this.attributes={},this.morphAttributes={},this.groups=[],this.boundingBox=null,this.boundingSphere=null;const e={};this.name=t.name;const n=t.index;n!==null&&this.setIndex(n.clone());const i=t.attributes;for(const c in i){const h=i[c];this.setAttribute(c,h.clone(e))}const r=t.morphAttributes;for(const c in r){const h=[],f=r[c];for(let u=0,d=f.length;u<d;u++)h.push(f[u].clone(e));this.morphAttributes[c]=h}this.morphTargetsRelative=t.morphTargetsRelative;const a=t.groups;for(let c=0,h=a.length;c<h;c++){const f=a[c];this.addGroup(f.start,f.count,f.materialIndex)}const o=t.boundingBox;o!==null&&(this.boundingBox=o.clone());const l=t.boundingSphere;return l!==null&&(this.boundingSphere=l.clone()),this.drawRange.start=t.drawRange.start,this.drawRange.count=t.drawRange.count,this.userData=t.userData,this._transformed=t._transformed,this}dispose(){this.dispatchEvent({type:"dispose"})}}class ec{constructor(t,e){this.isInterleavedBuffer=!0,this.array=t,this.stride=e,this.count=t!==void 0?t.length/e:0,this.usage=Jl,this.updateRanges=[],this.version=0,this.uuid=Cn()}onUploadCallback(){}set needsUpdate(t){t===!0&&this.version++}setUsage(t){return this.usage=t,this}addUpdateRange(t,e){this.updateRanges.push({start:t,count:e})}clearUpdateRanges(){this.updateRanges.length=0}copy(t){return this.array=new t.array.constructor(t.array),this.count=t.count,this.stride=t.stride,this.usage=t.usage,this}copyAt(t,e,n){t*=this.stride,n*=e.stride;for(let i=0,r=this.stride;i<r;i++)this.array[t+i]=e.array[n+i];return this}set(t,e=0){return this.array.set(t,e),this}clone(t){t.arrayBuffers===void 0&&(t.arrayBuffers={}),this.array.buffer._uuid===void 0&&(this.array.buffer._uuid=Cn()),t.arrayBuffers[this.array.buffer._uuid]===void 0&&(t.arrayBuffers[this.array.buffer._uuid]=this.array.slice(0).buffer);const e=new this.array.constructor(t.arrayBuffers[this.array.buffer._uuid]),n=new this.constructor(e,this.stride);return n.setUsage(this.usage),n}onUpload(t){return this.onUploadCallback=t,this}toJSON(t){t.arrayBuffers===void 0&&(t.arrayBuffers={}),this.array.buffer._uuid===void 0&&(this.array.buffer._uuid=Cn()),t.arrayBuffers[this.array.buffer._uuid]===void 0&&(t.arrayBuffers[this.array.buffer._uuid]=Array.from(new Uint32Array(this.array.buffer)));const e={uuid:this.uuid,buffer:this.array.buffer._uuid,type:this.array.constructor.name,stride:this.stride};return e.usage=this.usage,e}}const on=new I;class Ts{constructor(t,e,n,i=!1){this.isInterleavedBufferAttribute=!0,this.name="",this.data=t,this.itemSize=e,this.offset=n,this.normalized=i}get count(){return this.data.count}get array(){return this.data.array}set needsUpdate(t){this.data.needsUpdate=t}applyMatrix4(t){for(let e=0,n=this.data.count;e<n;e++)on.fromBufferAttribute(this,e),on.applyMatrix4(t),this.setXYZ(e,on.x,on.y,on.z);return this}applyNormalMatrix(t){for(let e=0,n=this.count;e<n;e++)on.fromBufferAttribute(this,e),on.applyNormalMatrix(t),this.setXYZ(e,on.x,on.y,on.z);return this}transformDirection(t){for(let e=0,n=this.count;e<n;e++)on.fromBufferAttribute(this,e),on.transformDirection(t),this.setXYZ(e,on.x,on.y,on.z);return this}getComponent(t,e){let n=this.array[t*this.data.stride+this.offset+e];return this.normalized&&(n=hn(n,this.array)),n}setComponent(t,e,n){return this.normalized&&(n=te(n,this.array)),this.data.array[t*this.data.stride+this.offset+e]=n,this}setX(t,e){return this.normalized&&(e=te(e,this.array)),this.data.array[t*this.data.stride+this.offset]=e,this}setY(t,e){return this.normalized&&(e=te(e,this.array)),this.data.array[t*this.data.stride+this.offset+1]=e,this}setZ(t,e){return this.normalized&&(e=te(e,this.array)),this.data.array[t*this.data.stride+this.offset+2]=e,this}setW(t,e){return this.normalized&&(e=te(e,this.array)),this.data.array[t*this.data.stride+this.offset+3]=e,this}getX(t){let e=this.data.array[t*this.data.stride+this.offset];return this.normalized&&(e=hn(e,this.array)),e}getY(t){let e=this.data.array[t*this.data.stride+this.offset+1];return this.normalized&&(e=hn(e,this.array)),e}getZ(t){let e=this.data.array[t*this.data.stride+this.offset+2];return this.normalized&&(e=hn(e,this.array)),e}getW(t){let e=this.data.array[t*this.data.stride+this.offset+3];return this.normalized&&(e=hn(e,this.array)),e}setXY(t,e,n){return t=t*this.data.stride+this.offset,this.normalized&&(e=te(e,this.array),n=te(n,this.array)),this.data.array[t+0]=e,this.data.array[t+1]=n,this}setXYZ(t,e,n,i){return t=t*this.data.stride+this.offset,this.normalized&&(e=te(e,this.array),n=te(n,this.array),i=te(i,this.array)),this.data.array[t+0]=e,this.data.array[t+1]=n,this.data.array[t+2]=i,this}setXYZW(t,e,n,i,r){return t=t*this.data.stride+this.offset,this.normalized&&(e=te(e,this.array),n=te(n,this.array),i=te(i,this.array),r=te(r,this.array)),this.data.array[t+0]=e,this.data.array[t+1]=n,this.data.array[t+2]=i,this.data.array[t+3]=r,this}clone(t){if(t===void 0){ba("InterleavedBufferAttribute.clone(): Cloning an interleaved buffer attribute will de-interleave buffer data.");const e=[];for(let n=0;n<this.count;n++){const i=n*this.data.stride+this.offset;for(let r=0;r<this.itemSize;r++)e.push(this.data.array[i+r])}return new ue(new this.array.constructor(e),this.itemSize,this.normalized)}else return t.interleavedBuffers===void 0&&(t.interleavedBuffers={}),t.interleavedBuffers[this.data.uuid]===void 0&&(t.interleavedBuffers[this.data.uuid]=this.data.clone(t)),new Ts(t.interleavedBuffers[this.data.uuid],this.itemSize,this.offset,this.normalized)}toJSON(t){if(t===void 0){ba("InterleavedBufferAttribute.toJSON(): Serializing an interleaved buffer attribute will de-interleave buffer data.");const e=[];for(let n=0;n<this.count;n++){const i=n*this.data.stride+this.offset;for(let r=0;r<this.itemSize;r++)e.push(this.data.array[i+r])}return{itemSize:this.itemSize,type:this.array.constructor.name,array:e,normalized:this.normalized}}else return t.interleavedBuffers===void 0&&(t.interleavedBuffers={}),t.interleavedBuffers[this.data.uuid]===void 0&&(t.interleavedBuffers[this.data.uuid]=this.data.toJSON(t)),{isInterleavedBufferAttribute:!0,itemSize:this.itemSize,data:this.data.uuid,offset:this.offset,normalized:this.normalized}}}const qc=new I,e_=new I,n_=new Jt;class Mi{constructor(t=new I(1,0,0),e=0){this.isPlane=!0,this.normal=t,this.constant=e}set(t,e){return this.normal.copy(t),this.constant=e,this}setComponents(t,e,n,i){return this.normal.set(t,e,n),this.constant=i,this}setFromNormalAndCoplanarPoint(t,e){return this.normal.copy(t),this.constant=-e.dot(this.normal),this}setFromCoplanarPoints(t,e,n){const i=qc.subVectors(n,e).cross(e_.subVectors(t,e)).normalize();return this.setFromNormalAndCoplanarPoint(i,t),this}copy(t){return this.normal.copy(t.normal),this.constant=t.constant,this}normalize(){const t=1/this.normal.length();return this.normal.multiplyScalar(t),this.constant*=t,this}negate(){return this.constant*=-1,this.normal.negate(),this}distanceToPoint(t){return this.normal.dot(t)+this.constant}distanceToSphere(t){return this.distanceToPoint(t.center)-t.radius}projectPoint(t,e){return e.copy(t).addScaledVector(this.normal,-this.distanceToPoint(t))}intersectLine(t,e,n=!0){const i=t.delta(qc),r=this.normal.dot(i);if(r===0)return this.distanceToPoint(t.start)===0?e.copy(t.start):null;const a=-(t.start.dot(this.normal)+this.constant)/r;return n===!0&&(a<0||a>1)?null:e.copy(t.start).addScaledVector(i,a)}intersectsLine(t){const e=this.distanceToPoint(t.start),n=this.distanceToPoint(t.end);return e<0&&n>0||n<0&&e>0}intersectsBox(t){return t.intersectsPlane(this)}intersectsSphere(t){return t.intersectsPlane(this)}coplanarPoint(t){return t.copy(this.normal).multiplyScalar(-this.constant)}applyMatrix4(t,e){const n=e||n_.getNormalMatrix(t),i=this.coplanarPoint(qc).applyMatrix4(t),r=this.normal.applyMatrix3(n).normalize();return this.constant=-i.dot(r),this}translate(t){return this.constant-=t.dot(this.normal),this}equals(t){return t.normal.equals(this.normal)&&t.constant===this.constant}clone(){return new this.constructor().copy(this)}toJSON(){return{normal:this.normal.toArray(),constant:this.constant}}fromJSON(t){return this.normal.fromArray(t.normal),this.constant=t.constant,this}}let i_=0;class Ze extends Jn{constructor(){super(),this.isMaterial=!0,Object.defineProperty(this,"id",{value:i_++}),this.uuid=Cn(),this.name="",this.type="Material",this.blending=cr,this.side=Ii,this.vertexColors=!1,this.opacity=1,this.transparent=!1,this.alphaHash=!1,this.blendSrc=Gh,this.blendDst=Hh,this.blendEquation=xs,this.blendSrcAlpha=null,this.blendDstAlpha=null,this.blendEquationAlpha=null,this.blendColor=new ut(0,0,0),this.blendAlpha=0,this.depthFunc=fr,this.depthTest=!0,this.depthWrite=!0,this.stencilWriteMask=255,this.stencilFunc=_p,this.stencilRef=0,this.stencilFuncMask=255,this.stencilFail=Go,this.stencilZFail=Go,this.stencilZPass=Go,this.stencilWrite=!1,this.clippingPlanes=null,this.clipIntersection=!1,this.clipShadows=!1,this.shadowSide=null,this.colorWrite=!0,this.precision=null,this.polygonOffset=!1,this.polygonOffsetFactor=0,this.polygonOffsetUnits=0,this.dithering=!1,this.alphaToCoverage=!1,this.premultipliedAlpha=!1,this.forceSinglePass=!1,this.allowOverride=!0,this.visible=!0,this.toneMapped=!0,this.userData={},this.version=0,this._alphaTest=0}get alphaTest(){return this._alphaTest}set alphaTest(t){this._alphaTest>0!=t>0&&this.version++,this._alphaTest=t}onBeforeRender(){}onBeforeCompile(){}customProgramCacheKey(){return this.onBeforeCompile.toString()}setValues(t){if(t!==void 0)for(const e in t){const n=t[e];if(n===void 0){pt(`Material: parameter '${e}' has value of undefined.`);continue}const i=this[e];if(i===void 0){pt(`Material: '${e}' is not a property of THREE.${this.type}.`);continue}i&&i.isColor?i.set(n):i&&i.isVector2&&n&&n.isVector2||i&&i.isEuler&&n&&n.isEuler||i&&i.isVector3&&n&&n.isVector3?i.copy(n):this[e]=n}}toJSON(t){const e=t===void 0||typeof t=="string";e&&(t={textures:{},images:{}});const n={metadata:{version:4.7,type:"Material",generator:"Material.toJSON"}};n.uuid=this.uuid,n.type=this.type,n.blending=this.blending,n.side=this.side,n.shadowSide=this.shadowSide,n.vertexColors=this.vertexColors,n.opacity=this.opacity,n.transparent=this.transparent,n.blendSrc=this.blendSrc,n.blendDst=this.blendDst,n.blendEquation=this.blendEquation,n.blendSrcAlpha=this.blendSrcAlpha,n.blendDstAlpha=this.blendDstAlpha,n.blendEquationAlpha=this.blendEquationAlpha,n.blendColor=this.blendColor.getHex(),n.blendAlpha=this.blendAlpha,n.depthFunc=this.depthFunc,n.depthTest=this.depthTest,n.depthWrite=this.depthWrite,n.colorWrite=this.colorWrite,n.clipIntersection=this.clipIntersection,n.clipShadows=this.clipShadows,n.stencilWriteMask=this.stencilWriteMask,n.stencilFunc=this.stencilFunc,n.stencilRef=this.stencilRef,n.stencilFuncMask=this.stencilFuncMask,n.stencilFail=this.stencilFail,n.stencilZFail=this.stencilZFail,n.stencilZPass=this.stencilZPass,n.stencilWrite=this.stencilWrite,n.polygonOffset=this.polygonOffset,n.polygonOffsetFactor=this.polygonOffsetFactor,n.polygonOffsetUnits=this.polygonOffsetUnits,n.dithering=this.dithering,n.alphaTest=this.alphaTest,n.alphaHash=this.alphaHash,n.alphaToCoverage=this.alphaToCoverage,n.premultipliedAlpha=this.premultipliedAlpha,n.forceSinglePass=this.forceSinglePass,n.allowOverride=this.allowOverride,n.visible=this.visible,n.toneMapped=this.toneMapped,n.name=this.name,this.color&&this.color.isColor&&(n.color=this.color.getHex()),this.roughness!==void 0&&(n.roughness=this.roughness),this.metalness!==void 0&&(n.metalness=this.metalness),this.sheen!==void 0&&(n.sheen=this.sheen),this.sheenColor&&this.sheenColor.isColor&&(n.sheenColor=this.sheenColor.getHex()),this.sheenRoughness!==void 0&&(n.sheenRoughness=this.sheenRoughness),this.emissive&&this.emissive.isColor&&(n.emissive=this.emissive.getHex()),this.emissiveIntensity!==void 0&&(n.emissiveIntensity=this.emissiveIntensity),this.specular&&this.specular.isColor&&(n.specular=this.specular.getHex()),this.specularIntensity!==void 0&&(n.specularIntensity=this.specularIntensity),this.specularColor&&this.specularColor.isColor&&(n.specularColor=this.specularColor.getHex()),this.shininess!==void 0&&(n.shininess=this.shininess),this.clearcoat!==void 0&&(n.clearcoat=this.clearcoat),this.clearcoatRoughness!==void 0&&(n.clearcoatRoughness=this.clearcoatRoughness),this.clearcoatMap&&this.clearcoatMap.isTexture&&(n.clearcoatMap=this.clearcoatMap.toJSON(t).uuid),this.clearcoatRoughnessMap&&this.clearcoatRoughnessMap.isTexture&&(n.clearcoatRoughnessMap=this.clearcoatRoughnessMap.toJSON(t).uuid),this.clearcoatNormalMap&&this.clearcoatNormalMap.isTexture&&(n.clearcoatNormalMap=this.clearcoatNormalMap.toJSON(t).uuid,n.clearcoatNormalScale=this.clearcoatNormalScale.toArray()),this.sheenColorMap&&this.sheenColorMap.isTexture&&(n.sheenColorMap=this.sheenColorMap.toJSON(t).uuid),this.sheenRoughnessMap&&this.sheenRoughnessMap.isTexture&&(n.sheenRoughnessMap=this.sheenRoughnessMap.toJSON(t).uuid),this.dispersion!==void 0&&(n.dispersion=this.dispersion),this.retroreflectivity!==void 0&&(n.retroreflectivity=this.retroreflectivity),this.iridescence!==void 0&&(n.iridescence=this.iridescence),this.iridescenceIOR!==void 0&&(n.iridescenceIOR=this.iridescenceIOR),this.iridescenceThicknessRange!==void 0&&(n.iridescenceThicknessRange=this.iridescenceThicknessRange),this.iridescenceMap&&this.iridescenceMap.isTexture&&(n.iridescenceMap=this.iridescenceMap.toJSON(t).uuid),this.iridescenceThicknessMap&&this.iridescenceThicknessMap.isTexture&&(n.iridescenceThicknessMap=this.iridescenceThicknessMap.toJSON(t).uuid),this.anisotropy!==void 0&&(n.anisotropy=this.anisotropy),this.anisotropyRotation!==void 0&&(n.anisotropyRotation=this.anisotropyRotation),this.anisotropyMap&&this.anisotropyMap.isTexture&&(n.anisotropyMap=this.anisotropyMap.toJSON(t).uuid),this.map&&this.map.isTexture&&(n.map=this.map.toJSON(t).uuid),this.matcap&&this.matcap.isTexture&&(n.matcap=this.matcap.toJSON(t).uuid),this.alphaMap&&this.alphaMap.isTexture&&(n.alphaMap=this.alphaMap.toJSON(t).uuid),this.lightMap&&this.lightMap.isTexture&&(n.lightMap=this.lightMap.toJSON(t).uuid,n.lightMapIntensity=this.lightMapIntensity),this.aoMap&&this.aoMap.isTexture&&(n.aoMap=this.aoMap.toJSON(t).uuid,n.aoMapIntensity=this.aoMapIntensity),this.bumpMap&&this.bumpMap.isTexture&&(n.bumpMap=this.bumpMap.toJSON(t).uuid,n.bumpScale=this.bumpScale),this.normalMap&&this.normalMap.isTexture&&(n.normalMap=this.normalMap.toJSON(t).uuid,n.normalMapType=this.normalMapType,n.normalScale=this.normalScale.toArray()),this.displacementMap&&this.displacementMap.isTexture&&(n.displacementMap=this.displacementMap.toJSON(t).uuid,n.displacementScale=this.displacementScale,n.displacementBias=this.displacementBias),this.roughnessMap&&this.roughnessMap.isTexture&&(n.roughnessMap=this.roughnessMap.toJSON(t).uuid),this.metalnessMap&&this.metalnessMap.isTexture&&(n.metalnessMap=this.metalnessMap.toJSON(t).uuid),this.emissiveMap&&this.emissiveMap.isTexture&&(n.emissiveMap=this.emissiveMap.toJSON(t).uuid),this.specularMap&&this.specularMap.isTexture&&(n.specularMap=this.specularMap.toJSON(t).uuid),this.specularIntensityMap&&this.specularIntensityMap.isTexture&&(n.specularIntensityMap=this.specularIntensityMap.toJSON(t).uuid),this.specularColorMap&&this.specularColorMap.isTexture&&(n.specularColorMap=this.specularColorMap.toJSON(t).uuid),this.envMap&&this.envMap.isTexture&&(n.envMap=this.envMap.toJSON(t).uuid,this.combine!==void 0&&(n.combine=this.combine)),this.envMapRotation!==void 0&&(n.envMapRotation=this.envMapRotation.toArray()),this.envMapIntensity!==void 0&&(n.envMapIntensity=this.envMapIntensity),this.reflectivity!==void 0&&(n.reflectivity=this.reflectivity),this.refractionRatio!==void 0&&(n.refractionRatio=this.refractionRatio),this.gradientMap&&this.gradientMap.isTexture&&(n.gradientMap=this.gradientMap.toJSON(t).uuid),this.transmission!==void 0&&(n.transmission=this.transmission),this.transmissionMap&&this.transmissionMap.isTexture&&(n.transmissionMap=this.transmissionMap.toJSON(t).uuid),this.thickness!==void 0&&(n.thickness=this.thickness),this.thicknessMap&&this.thicknessMap.isTexture&&(n.thicknessMap=this.thicknessMap.toJSON(t).uuid),this.attenuationDistance!==void 0&&(n.attenuationDistance=this.attenuationDistance),this.attenuationColor!==void 0&&(n.attenuationColor=this.attenuationColor.getHex()),this.size!==void 0&&(n.size=this.size),this.sizeAttenuation!==void 0&&(n.sizeAttenuation=this.sizeAttenuation),Array.isArray(this.clippingPlanes)&&this.clippingPlanes.length>0&&(n.clippingPlanes=this.clippingPlanes.map(r=>r.toJSON())),this.rotation!==void 0&&(n.rotation=this.rotation),this.depthPacking!==void 0&&(n.depthPacking=this.depthPacking),this.linewidth!==void 0&&(n.linewidth=this.linewidth),this.linecap!==void 0&&(n.linecap=this.linecap),this.linejoin!==void 0&&(n.linejoin=this.linejoin),this.dashSize!==void 0&&(n.dashSize=this.dashSize),this.gapSize!==void 0&&(n.gapSize=this.gapSize),this.scale!==void 0&&(n.scale=this.scale),this.wireframe!==void 0&&(n.wireframe=this.wireframe),this.wireframeLinewidth!==void 0&&(n.wireframeLinewidth=this.wireframeLinewidth),this.wireframeLinecap!==void 0&&(n.wireframeLinecap=this.wireframeLinecap),this.wireframeLinejoin!==void 0&&(n.wireframeLinejoin=this.wireframeLinejoin),this.flatShading!==void 0&&(n.flatShading=this.flatShading),this.fog!==void 0&&(n.fog=this.fog),Object.keys(this.userData).length>0&&(n.userData=this.userData);function i(r){const a=[];for(const o in r){const l=r[o];delete l.metadata,a.push(l)}return a}if(e){const r=i(t.textures),a=i(t.images);r.length>0&&(n.textures=r),a.length>0&&(n.images=a)}return n}fromJSON(t,e){if(t.uuid!==void 0&&(this.uuid=t.uuid),t.name!==void 0&&(this.name=t.name),t.color!==void 0&&this.color!==void 0&&this.color.setHex(t.color),t.roughness!==void 0&&(this.roughness=t.roughness),t.metalness!==void 0&&(this.metalness=t.metalness),t.sheen!==void 0&&(this.sheen=t.sheen),t.sheenColor!==void 0&&(this.sheenColor=new ut().setHex(t.sheenColor)),t.sheenRoughness!==void 0&&(this.sheenRoughness=t.sheenRoughness),t.emissive!==void 0&&this.emissive!==void 0&&this.emissive.setHex(t.emissive),t.specular!==void 0&&this.specular!==void 0&&this.specular.setHex(t.specular),t.specularIntensity!==void 0&&(this.specularIntensity=t.specularIntensity),t.specularColor!==void 0&&this.specularColor!==void 0&&this.specularColor.setHex(t.specularColor),t.shininess!==void 0&&(this.shininess=t.shininess),t.clearcoat!==void 0&&(this.clearcoat=t.clearcoat),t.clearcoatRoughness!==void 0&&(this.clearcoatRoughness=t.clearcoatRoughness),t.dispersion!==void 0&&(this.dispersion=t.dispersion),t.retroreflectivity!==void 0&&(this.retroreflectivity=t.retroreflectivity),t.iridescence!==void 0&&(this.iridescence=t.iridescence),t.iridescenceIOR!==void 0&&(this.iridescenceIOR=t.iridescenceIOR),t.iridescenceThicknessRange!==void 0&&(this.iridescenceThicknessRange=t.iridescenceThicknessRange),t.transmission!==void 0&&(this.transmission=t.transmission),t.thickness!==void 0&&(this.thickness=t.thickness),t.attenuationDistance!==void 0&&(this.attenuationDistance=t.attenuationDistance),t.attenuationColor!==void 0&&this.attenuationColor!==void 0&&this.attenuationColor.setHex(t.attenuationColor),t.anisotropy!==void 0&&(this.anisotropy=t.anisotropy),t.anisotropyRotation!==void 0&&(this.anisotropyRotation=t.anisotropyRotation),t.fog!==void 0&&(this.fog=t.fog),t.flatShading!==void 0&&(this.flatShading=t.flatShading),t.blending!==void 0&&(this.blending=t.blending),t.combine!==void 0&&(this.combine=t.combine),t.side!==void 0&&(this.side=t.side),t.shadowSide!==void 0&&(this.shadowSide=t.shadowSide),t.opacity!==void 0&&(this.opacity=t.opacity),t.transparent!==void 0&&(this.transparent=t.transparent),t.alphaTest!==void 0&&(this.alphaTest=t.alphaTest),t.alphaHash!==void 0&&(this.alphaHash=t.alphaHash),t.depthFunc!==void 0&&(this.depthFunc=t.depthFunc),t.depthTest!==void 0&&(this.depthTest=t.depthTest),t.depthWrite!==void 0&&(this.depthWrite=t.depthWrite),t.colorWrite!==void 0&&(this.colorWrite=t.colorWrite),t.clippingPlanes!==void 0&&(this.clippingPlanes=t.clippingPlanes.map(n=>new Mi().fromJSON(n))),t.clipIntersection!==void 0&&(this.clipIntersection=t.clipIntersection),t.clipShadows!==void 0&&(this.clipShadows=t.clipShadows),t.depthPacking!==void 0&&(this.depthPacking=t.depthPacking),t.blendSrc!==void 0&&(this.blendSrc=t.blendSrc),t.blendDst!==void 0&&(this.blendDst=t.blendDst),t.blendEquation!==void 0&&(this.blendEquation=t.blendEquation),t.blendSrcAlpha!==void 0&&(this.blendSrcAlpha=t.blendSrcAlpha),t.blendDstAlpha!==void 0&&(this.blendDstAlpha=t.blendDstAlpha),t.blendEquationAlpha!==void 0&&(this.blendEquationAlpha=t.blendEquationAlpha),t.blendColor!==void 0&&this.blendColor!==void 0&&this.blendColor.setHex(t.blendColor),t.blendAlpha!==void 0&&(this.blendAlpha=t.blendAlpha),t.stencilWriteMask!==void 0&&(this.stencilWriteMask=t.stencilWriteMask),t.stencilFunc!==void 0&&(this.stencilFunc=t.stencilFunc),t.stencilRef!==void 0&&(this.stencilRef=t.stencilRef),t.stencilFuncMask!==void 0&&(this.stencilFuncMask=t.stencilFuncMask),t.stencilFail!==void 0&&(this.stencilFail=t.stencilFail),t.stencilZFail!==void 0&&(this.stencilZFail=t.stencilZFail),t.stencilZPass!==void 0&&(this.stencilZPass=t.stencilZPass),t.stencilWrite!==void 0&&(this.stencilWrite=t.stencilWrite),t.wireframe!==void 0&&(this.wireframe=t.wireframe),t.wireframeLinewidth!==void 0&&(this.wireframeLinewidth=t.wireframeLinewidth),t.wireframeLinecap!==void 0&&(this.wireframeLinecap=t.wireframeLinecap),t.wireframeLinejoin!==void 0&&(this.wireframeLinejoin=t.wireframeLinejoin),t.rotation!==void 0&&(this.rotation=t.rotation),t.linewidth!==void 0&&(this.linewidth=t.linewidth),t.linecap!==void 0&&(this.linecap=t.linecap),t.linejoin!==void 0&&(this.linejoin=t.linejoin),t.dashSize!==void 0&&(this.dashSize=t.dashSize),t.gapSize!==void 0&&(this.gapSize=t.gapSize),t.scale!==void 0&&(this.scale=t.scale),t.polygonOffset!==void 0&&(this.polygonOffset=t.polygonOffset),t.polygonOffsetFactor!==void 0&&(this.polygonOffsetFactor=t.polygonOffsetFactor),t.polygonOffsetUnits!==void 0&&(this.polygonOffsetUnits=t.polygonOffsetUnits),t.dithering!==void 0&&(this.dithering=t.dithering),t.alphaToCoverage!==void 0&&(this.alphaToCoverage=t.alphaToCoverage),t.premultipliedAlpha!==void 0&&(this.premultipliedAlpha=t.premultipliedAlpha),t.forceSinglePass!==void 0&&(this.forceSinglePass=t.forceSinglePass),t.allowOverride!==void 0&&(this.allowOverride=t.allowOverride),t.visible!==void 0&&(this.visible=t.visible),t.toneMapped!==void 0&&(this.toneMapped=t.toneMapped),t.userData!==void 0&&(this.userData=t.userData),t.vertexColors!==void 0&&(typeof t.vertexColors=="number"?this.vertexColors=t.vertexColors>0:this.vertexColors=t.vertexColors),t.size!==void 0&&(this.size=t.size),t.sizeAttenuation!==void 0&&(this.sizeAttenuation=t.sizeAttenuation),t.map!==void 0&&(this.map=e[t.map]||null),t.matcap!==void 0&&(this.matcap=e[t.matcap]||null),t.alphaMap!==void 0&&(this.alphaMap=e[t.alphaMap]||null),t.bumpMap!==void 0&&(this.bumpMap=e[t.bumpMap]||null),t.bumpScale!==void 0&&(this.bumpScale=t.bumpScale),t.normalMap!==void 0&&(this.normalMap=e[t.normalMap]||null),t.normalMapType!==void 0&&(this.normalMapType=t.normalMapType),t.normalScale!==void 0){let n=t.normalScale;Array.isArray(n)===!1&&(n=[n,n]),this.normalScale=new it().fromArray(n)}return t.displacementMap!==void 0&&(this.displacementMap=e[t.displacementMap]||null),t.displacementScale!==void 0&&(this.displacementScale=t.displacementScale),t.displacementBias!==void 0&&(this.displacementBias=t.displacementBias),t.roughnessMap!==void 0&&(this.roughnessMap=e[t.roughnessMap]||null),t.metalnessMap!==void 0&&(this.metalnessMap=e[t.metalnessMap]||null),t.emissiveMap!==void 0&&(this.emissiveMap=e[t.emissiveMap]||null),t.emissiveIntensity!==void 0&&(this.emissiveIntensity=t.emissiveIntensity),t.specularMap!==void 0&&(this.specularMap=e[t.specularMap]||null),t.specularIntensityMap!==void 0&&(this.specularIntensityMap=e[t.specularIntensityMap]||null),t.specularColorMap!==void 0&&(this.specularColorMap=e[t.specularColorMap]||null),t.envMap!==void 0&&(this.envMap=e[t.envMap]||null),t.envMapRotation!==void 0&&this.envMapRotation.fromArray(t.envMapRotation),t.envMapIntensity!==void 0&&(this.envMapIntensity=t.envMapIntensity),t.reflectivity!==void 0&&(this.reflectivity=t.reflectivity),t.refractionRatio!==void 0&&(this.refractionRatio=t.refractionRatio),t.lightMap!==void 0&&(this.lightMap=e[t.lightMap]||null),t.lightMapIntensity!==void 0&&(this.lightMapIntensity=t.lightMapIntensity),t.aoMap!==void 0&&(this.aoMap=e[t.aoMap]||null),t.aoMapIntensity!==void 0&&(this.aoMapIntensity=t.aoMapIntensity),t.gradientMap!==void 0&&(this.gradientMap=e[t.gradientMap]||null),t.clearcoatMap!==void 0&&(this.clearcoatMap=e[t.clearcoatMap]||null),t.clearcoatRoughnessMap!==void 0&&(this.clearcoatRoughnessMap=e[t.clearcoatRoughnessMap]||null),t.clearcoatNormalMap!==void 0&&(this.clearcoatNormalMap=e[t.clearcoatNormalMap]||null),t.clearcoatNormalScale!==void 0&&(this.clearcoatNormalScale=new it().fromArray(t.clearcoatNormalScale)),t.iridescenceMap!==void 0&&(this.iridescenceMap=e[t.iridescenceMap]||null),t.iridescenceThicknessMap!==void 0&&(this.iridescenceThicknessMap=e[t.iridescenceThicknessMap]||null),t.transmissionMap!==void 0&&(this.transmissionMap=e[t.transmissionMap]||null),t.thicknessMap!==void 0&&(this.thicknessMap=e[t.thicknessMap]||null),t.anisotropyMap!==void 0&&(this.anisotropyMap=e[t.anisotropyMap]||null),t.sheenColorMap!==void 0&&(this.sheenColorMap=e[t.sheenColorMap]||null),t.sheenRoughnessMap!==void 0&&(this.sheenRoughnessMap=e[t.sheenRoughnessMap]||null),this}clone(){return new this.constructor().copy(this)}copy(t){this.name=t.name,this.blending=t.blending,this.side=t.side,this.vertexColors=t.vertexColors,this.opacity=t.opacity,this.transparent=t.transparent,this.blendSrc=t.blendSrc,this.blendDst=t.blendDst,this.blendEquation=t.blendEquation,this.blendSrcAlpha=t.blendSrcAlpha,this.blendDstAlpha=t.blendDstAlpha,this.blendEquationAlpha=t.blendEquationAlpha,this.blendColor.copy(t.blendColor),this.blendAlpha=t.blendAlpha,this.depthFunc=t.depthFunc,this.depthTest=t.depthTest,this.depthWrite=t.depthWrite,this.stencilWriteMask=t.stencilWriteMask,this.stencilFunc=t.stencilFunc,this.stencilRef=t.stencilRef,this.stencilFuncMask=t.stencilFuncMask,this.stencilFail=t.stencilFail,this.stencilZFail=t.stencilZFail,this.stencilZPass=t.stencilZPass,this.stencilWrite=t.stencilWrite;const e=t.clippingPlanes;let n=null;if(e!==null){const i=e.length;n=new Array(i);for(let r=0;r!==i;++r)n[r]=e[r].clone()}return this.clippingPlanes=n,this.clipIntersection=t.clipIntersection,this.clipShadows=t.clipShadows,this.shadowSide=t.shadowSide,this.colorWrite=t.colorWrite,this.precision=t.precision,this.polygonOffset=t.polygonOffset,this.polygonOffsetFactor=t.polygonOffsetFactor,this.polygonOffsetUnits=t.polygonOffsetUnits,this.dithering=t.dithering,this.alphaTest=t.alphaTest,this.alphaHash=t.alphaHash,this.alphaToCoverage=t.alphaToCoverage,this.premultipliedAlpha=t.premultipliedAlpha,this.forceSinglePass=t.forceSinglePass,this.allowOverride=t.allowOverride,this.visible=t.visible,this.toneMapped=t.toneMapped,this.userData=JSON.parse(JSON.stringify(t.userData)),this}dispose(){this.dispatchEvent({type:"dispose"})}set needsUpdate(t){t===!0&&this.version++}}class cu extends Ze{constructor(t){super(),this.isSpriteMaterial=!0,this.type="SpriteMaterial",this.color=new ut(16777215),this.map=null,this.alphaMap=null,this.rotation=0,this.sizeAttenuation=!0,this.transparent=!0,this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.color.copy(t.color),this.map=t.map,this.alphaMap=t.alphaMap,this.rotation=t.rotation,this.sizeAttenuation=t.sizeAttenuation,this.fog=t.fog,this}}let qs;const Nr=new I,Ys=new I,Zs=new I,$s=new it,Ur=new it,Rp=new Yt,Ka=new I,Fr=new I,Qa=new I,gd=new it,Yc=new it,_d=new it;class Ip extends he{constructor(t=new cu){if(super(),this.isSprite=!0,this.type="Sprite",qs===void 0){qs=new Zt;const e=new Float32Array([-.5,-.5,0,0,0,.5,-.5,0,1,0,.5,.5,0,1,1,-.5,.5,0,0,1]),n=new ec(e,5);qs.setIndex([0,1,2,0,2,3]),qs.setAttribute("position",new Ts(n,3,0,!1)),qs.setAttribute("uv",new Ts(n,2,3,!1))}this.geometry=qs,this.material=t,this.center=new it(.5,.5),this.count=1}intersectsFrustum(t){return t.intersectsSprite(this)}raycast(t,e){t.camera===null&&Nt('Sprite: "Raycaster.camera" needs to be set in order to raycast against sprites.'),Ys.setFromMatrixScale(this.matrixWorld),Rp.copy(t.camera.matrixWorld),this.modelViewMatrix.multiplyMatrices(t.camera.matrixWorldInverse,this.matrixWorld),Zs.setFromMatrixPosition(this.modelViewMatrix),t.camera.isPerspectiveCamera&&this.material.sizeAttenuation===!1&&Ys.multiplyScalar(-Zs.z);const n=this.material.rotation;let i,r;n!==0&&(r=Math.cos(n),i=Math.sin(n));const a=this.center;ja(Ka.set(-.5,-.5,0),Zs,a,Ys,i,r),ja(Fr.set(.5,-.5,0),Zs,a,Ys,i,r),ja(Qa.set(.5,.5,0),Zs,a,Ys,i,r),gd.set(0,0),Yc.set(1,0),_d.set(1,1);let o=t.ray.intersectTriangle(Ka,Fr,Qa,!1,Nr);if(o===null&&(ja(Fr.set(-.5,.5,0),Zs,a,Ys,i,r),Yc.set(0,1),o=t.ray.intersectTriangle(Ka,Qa,Fr,!1,Nr),o===null))return;const l=t.ray.origin.distanceTo(Nr);l<t.near||l>t.far||e.push({distance:l,point:Nr.clone(),uv:xn.getInterpolation(Nr,Ka,Fr,Qa,gd,Yc,_d,new it),face:null,object:this})}copy(t,e){return super.copy(t,e),t.center!==void 0&&this.center.copy(t.center),this.material=t.material,this}}function ja(s,t,e,n,i,r){$s.subVectors(s,e).addScalar(.5).multiply(n),i!==void 0?(Ur.x=r*$s.x-i*$s.y,Ur.y=i*$s.x+r*$s.y):Ur.copy($s),s.copy(t),s.x+=Ur.x,s.y+=Ur.y,s.applyMatrix4(Rp)}const to=new I,xd=new I;class Pp extends he{constructor(){super(),this.isLOD=!0,this._currentLevel=0,this.type="LOD",Object.defineProperties(this,{levels:{enumerable:!0,value:[]}}),this.autoUpdate=!0}copy(t){super.copy(t,!1);const e=t.levels;for(let n=0,i=e.length;n<i;n++){const r=e[n];this.addLevel(r.object.clone(),r.distance,r.hysteresis)}return this.autoUpdate=t.autoUpdate,this}addLevel(t,e=0,n=0){e=Math.abs(e);const i=this.levels;let r;for(r=0;r<i.length&&!(e<i[r].distance);r++);return i.splice(r,0,{distance:e,hysteresis:n,object:t}),this.add(t),this}removeLevel(t){const e=this.levels;for(let n=0;n<e.length;n++)if(e[n].distance===t){const i=e.splice(n,1);return this.remove(i[0].object),!0}return!1}getCurrentLevel(){return this._currentLevel}getObjectForDistance(t){const e=this.levels;if(e.length>0){let n,i;for(n=1,i=e.length;n<i;n++){let r=e[n].distance;if(e[n].object.visible&&(r-=r*e[n].hysteresis),t<r)break}return e[n-1].object}return null}raycast(t,e){if(this.levels.length>0){to.setFromMatrixPosition(this.matrixWorld);const i=t.ray.origin.distanceTo(to);this.getObjectForDistance(i).raycast(t,e)}}update(t){const e=this.levels;if(e.length>1){to.setFromMatrixPosition(t.matrixWorld),xd.setFromMatrixPosition(this.matrixWorld);const n=to.distanceTo(xd)/t.zoom;e[0].object.visible=!0;let i,r;for(i=1,r=e.length;i<r;i++){let a=e[i].distance;if(e[i].object.visible&&(a-=a*e[i].hysteresis),n>=a)e[i-1].object.visible=!1,e[i].object.visible=!0;else break}for(this._currentLevel=i-1;i<r;i++)e[i].object.visible=!1}}toJSON(t){const e=super.toJSON(t);e.object.autoUpdate=this.autoUpdate,e.object.levels=[];const n=this.levels;for(let i=0,r=n.length;i<r;i++){const a=n[i];e.object.levels.push({object:a.object.uuid,distance:a.distance,hysteresis:a.hysteresis})}return e}}const _i=new I,Zc=new I,eo=new I,no=new I;class wr{constructor(t=new I,e=new I(0,0,-1)){this.origin=t,this.direction=e}set(t,e){return this.origin.copy(t),this.direction.copy(e),this}copy(t){return this.origin.copy(t.origin),this.direction.copy(t.direction),this}at(t,e){return e.copy(this.origin).addScaledVector(this.direction,t)}lookAt(t){return this.direction.copy(t).sub(this.origin).normalize(),this}recast(t){return this.origin.copy(this.at(t,_i)),this}closestPointToPoint(t,e){e.subVectors(t,this.origin);const n=e.dot(this.direction);return n<0?e.copy(this.origin):e.copy(this.origin).addScaledVector(this.direction,n)}distanceToPoint(t){return Math.sqrt(this.distanceSqToPoint(t))}distanceSqToPoint(t){const e=_i.subVectors(t,this.origin).dot(this.direction);return e<0?this.origin.distanceToSquared(t):(_i.copy(this.origin).addScaledVector(this.direction,e),_i.distanceToSquared(t))}distanceSqToSegment(t,e,n,i){Zc.copy(t).add(e).multiplyScalar(.5),eo.copy(e).sub(t).normalize(),no.copy(this.origin).sub(Zc);const r=t.distanceTo(e)*.5,a=-this.direction.dot(eo),o=no.dot(this.direction),l=-no.dot(eo),c=no.lengthSq(),h=Math.abs(1-a*a);let f,u,d,p;if(h>0)if(f=a*l-o,u=a*o-l,p=r*h,f>=0)if(u>=-p)if(u<=p){const _=1/h;f*=_,u*=_,d=f*(f+a*u+2*o)+u*(a*f+u+2*l)+c}else u=r,f=Math.max(0,-(a*u+o)),d=-f*f+u*(u+2*l)+c;else u=-r,f=Math.max(0,-(a*u+o)),d=-f*f+u*(u+2*l)+c;else u<=-p?(f=Math.max(0,-(-a*r+o)),u=f>0?-r:Math.min(Math.max(-r,-l),r),d=-f*f+u*(u+2*l)+c):u<=p?(f=0,u=Math.min(Math.max(-r,-l),r),d=u*(u+2*l)+c):(f=Math.max(0,-(a*r+o)),u=f>0?r:Math.min(Math.max(-r,-l),r),d=-f*f+u*(u+2*l)+c);else u=a>0?-r:r,f=Math.max(0,-(a*u+o)),d=-f*f+u*(u+2*l)+c;return n&&n.copy(this.origin).addScaledVector(this.direction,f),i&&i.copy(Zc).addScaledVector(eo,u),d}intersectSphere(t,e){if(t.radius<0)return null;_i.subVectors(t.center,this.origin);const n=_i.dot(this.direction),i=_i.dot(_i)-n*n,r=t.radius*t.radius;if(i>r)return null;const a=Math.sqrt(r-i),o=n-a,l=n+a;return l<0?null:o<0?this.at(l,e):this.at(o,e)}intersectsSphere(t){return t.radius<0?!1:this.distanceSqToPoint(t.center)<=t.radius*t.radius}distanceToPlane(t){const e=t.normal.dot(this.direction);if(e===0)return t.distanceToPoint(this.origin)===0?0:null;const n=-(this.origin.dot(t.normal)+t.constant)/e;return n>=0?n:null}intersectPlane(t,e){const n=this.distanceToPlane(t);return n===null?null:this.at(n,e)}intersectsPlane(t){const e=t.distanceToPoint(this.origin);return e===0||t.normal.dot(this.direction)*e<0}intersectBox(t,e){let n,i,r,a,o,l;const c=1/this.direction.x,h=1/this.direction.y,f=1/this.direction.z,u=this.origin;return c>=0?(n=(t.min.x-u.x)*c,i=(t.max.x-u.x)*c):(n=(t.max.x-u.x)*c,i=(t.min.x-u.x)*c),h>=0?(r=(t.min.y-u.y)*h,a=(t.max.y-u.y)*h):(r=(t.max.y-u.y)*h,a=(t.min.y-u.y)*h),n>a||r>i||((r>n||isNaN(n))&&(n=r),(a<i||isNaN(i))&&(i=a),f>=0?(o=(t.min.z-u.z)*f,l=(t.max.z-u.z)*f):(o=(t.max.z-u.z)*f,l=(t.min.z-u.z)*f),n>l||o>i)||((o>n||n!==n)&&(n=o),(l<i||i!==i)&&(i=l),i<0)?null:this.at(n>=0?n:i,e)}intersectsBox(t){return this.intersectBox(t,_i)!==null}intersectTriangle(t,e,n,i,r){const a=this.origin,o=this.direction,l=o.x,c=o.y,h=o.z,f=t.x-a.x,u=t.y-a.y,d=t.z-a.z,p=e.x-a.x,_=e.y-a.y,g=e.z-a.z,m=n.x-a.x,x=n.y-a.y,M=n.z-a.z,y=Math.abs(l),w=Math.abs(c),b=Math.abs(h);let E,v,T,C,P,L,N,D,O,V,z,G;if(y>=w&&y>=b?(T=l,L=f,O=p,G=m,l>=0?(E=c,v=h,C=u,P=d,N=_,D=g,V=x,z=M):(E=h,v=c,C=d,P=u,N=g,D=_,V=M,z=x)):w>=b?(T=c,L=u,O=_,G=x,c>=0?(E=h,v=l,C=d,P=f,N=g,D=p,V=M,z=m):(E=l,v=h,C=f,P=d,N=p,D=g,V=m,z=M)):(T=h,L=d,O=g,G=M,h>=0?(E=l,v=c,C=f,P=u,N=p,D=_,V=m,z=x):(E=c,v=l,C=u,P=f,N=_,D=p,V=x,z=m)),T===0)return null;const X=E/T,$=v/T,Z=1/T,ct=C-X*L,bt=P-$*L,$t=N-X*O,Wt=D-$*O,Qt=V-X*G,K=z-$*G,tt=Qt*Wt-K*$t,ft=ct*K-bt*Qt,kt=$t*bt-Wt*ct;if(i){if(tt<0||ft<0||kt<0)return null}else if((tt<0||ft<0||kt<0)&&(tt>0||ft>0||kt>0))return null;const Tt=tt+ft+kt;if(Tt===0)return null;const Xt=Z*(tt*L+ft*O+kt*G);return(Tt>0?Xt<0:Xt>0)?null:this.at(Xt/Tt,r)}applyMatrix4(t){return this.origin.applyMatrix4(t),this.direction.transformDirection(t),this}equals(t){return t.origin.equals(this.origin)&&t.direction.equals(this.direction)}clone(){return new this.constructor().copy(this)}}class hi extends Ze{constructor(t){super(),this.isMeshBasicMaterial=!0,this.type="MeshBasicMaterial",this.color=new ut(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new $n,this.combine=Da,this.reflectivity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.color.copy(t.color),this.map=t.map,this.lightMap=t.lightMap,this.lightMapIntensity=t.lightMapIntensity,this.aoMap=t.aoMap,this.aoMapIntensity=t.aoMapIntensity,this.specularMap=t.specularMap,this.alphaMap=t.alphaMap,this.envMap=t.envMap,this.envMapRotation.copy(t.envMapRotation),this.combine=t.combine,this.reflectivity=t.reflectivity,this.refractionRatio=t.refractionRatio,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.wireframeLinecap=t.wireframeLinecap,this.wireframeLinejoin=t.wireframeLinejoin,this.fog=t.fog,this}}const yd=new Yt,as=new wr,io=new Ye,vd=new I,so=new I,ro=new I,ao=new I,$c=new I,oo=new I,Md=new I,lo=new I;class be extends he{constructor(t=new Zt,e=new hi){super(),this.isMesh=!0,this.type="Mesh",this.geometry=t,this.material=e,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.count=1,this.updateMorphTargets()}copy(t,e){return super.copy(t,e),t.morphTargetInfluences!==void 0&&(this.morphTargetInfluences=t.morphTargetInfluences.slice()),t.morphTargetDictionary!==void 0&&(this.morphTargetDictionary=Object.assign({},t.morphTargetDictionary)),this.material=Array.isArray(t.material)?t.material.slice():t.material,this.geometry=t.geometry,this}updateMorphTargets(){const e=this.geometry.morphAttributes,n=Object.keys(e);if(n.length>0){const i=e[n[0]];if(i!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,a=i.length;r<a;r++){const o=i[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[o]=r}}}}getVertexPosition(t,e){const n=this.geometry,i=n.attributes.position,r=n.morphAttributes.position,a=n.morphTargetsRelative;e.fromBufferAttribute(i,t);const o=this.morphTargetInfluences;if(r&&o){oo.set(0,0,0);for(let l=0,c=r.length;l<c;l++){const h=o[l],f=r[l];h!==0&&($c.fromBufferAttribute(f,t),a?oo.addScaledVector($c,h):oo.addScaledVector($c.sub(e),h))}e.add(oo)}return e}intersectsFrustum(t){return t.intersectsObject(this)}raycast(t,e){const n=this.geometry,i=this.material,r=this.matrixWorld;i!==void 0&&(n.boundingSphere===null&&n.computeBoundingSphere(),io.copy(n.boundingSphere),io.applyMatrix4(r),as.copy(t.ray).recast(t.near),!(io.containsPoint(as.origin)===!1&&(as.intersectSphere(io,vd)===null||as.origin.distanceToSquared(vd)>(t.far-t.near)**2))&&(yd.copy(r).invert(),as.copy(t.ray).applyMatrix4(yd),!(n.boundingBox!==null&&as.intersectsBox(n.boundingBox)===!1)&&this._computeIntersections(t,e,as)))}_computeIntersections(t,e,n){let i;const r=this.geometry,a=this.material,o=r.index,l=r.attributes.position,c=r.attributes.uv,h=r.attributes.uv1,f=r.attributes.normal,u=r.groups,d=r.drawRange;if(o!==null)if(Array.isArray(a))for(let p=0,_=u.length;p<_;p++){const g=u[p],m=a[g.materialIndex],x=Math.max(g.start,d.start),M=Math.min(o.count,Math.min(g.start+g.count,d.start+d.count));for(let y=x,w=M;y<w;y+=3){const b=o.getX(y),E=o.getX(y+1),v=o.getX(y+2);i=co(this,m,t,n,c,h,f,b,E,v),i&&(i.faceIndex=Math.floor(y/3),i.face.materialIndex=g.materialIndex,e.push(i))}}else{const p=Math.max(0,d.start),_=Math.min(o.count,d.start+d.count);for(let g=p,m=_;g<m;g+=3){const x=o.getX(g),M=o.getX(g+1),y=o.getX(g+2);i=co(this,a,t,n,c,h,f,x,M,y),i&&(i.faceIndex=Math.floor(g/3),e.push(i))}}else if(l!==void 0)if(Array.isArray(a))for(let p=0,_=u.length;p<_;p++){const g=u[p],m=a[g.materialIndex],x=Math.max(g.start,d.start),M=Math.min(l.count,Math.min(g.start+g.count,d.start+d.count));for(let y=x,w=M;y<w;y+=3){const b=y,E=y+1,v=y+2;i=co(this,m,t,n,c,h,f,b,E,v),i&&(i.faceIndex=Math.floor(y/3),i.face.materialIndex=g.materialIndex,e.push(i))}}else{const p=Math.max(0,d.start),_=Math.min(l.count,d.start+d.count);for(let g=p,m=_;g<m;g+=3){const x=g,M=g+1,y=g+2;i=co(this,a,t,n,c,h,f,x,M,y),i&&(i.faceIndex=Math.floor(g/3),e.push(i))}}}}function s_(s,t,e,n,i,r,a,o){let l;if(t.side===nn?l=n.intersectTriangle(a,r,i,!0,o):l=n.intersectTriangle(i,r,a,t.side===Ii,o),l===null)return null;lo.copy(o),lo.applyMatrix4(s.matrixWorld);const c=e.ray.origin.distanceTo(lo);return c<e.near||c>e.far?null:{distance:c,point:lo.clone(),object:s}}function co(s,t,e,n,i,r,a,o,l,c){s.getVertexPosition(o,so),s.getVertexPosition(l,ro),s.getVertexPosition(c,ao);const h=s_(s,t,e,n,so,ro,ao,Md);if(h){const f=new I;xn.getBarycoord(Md,so,ro,ao,f),i&&(h.uv=xn.getInterpolatedAttribute(i,o,l,c,f,new it)),r&&(h.uv1=xn.getInterpolatedAttribute(r,o,l,c,f,new it)),a&&(h.normal=xn.getInterpolatedAttribute(a,o,l,c,f,new I),h.normal.dot(n.direction)>0&&h.normal.multiplyScalar(-1));const u={a:o,b:l,c,normal:new I,materialIndex:0};xn.getNormal(so,ro,ao,u.normal),h.face=u,h.barycoord=f}return h}const Or=new xe,Sd=new xe,bd=new xe,r_=new xe,wd=new Yt,ho=new I,Jc=new Ye,Ad=new Yt,Kc=new wr;class Lp extends be{constructor(t,e){super(t,e),this.isSkinnedMesh=!0,this.type="SkinnedMesh",this.bindMode=bh,this.bindMatrix=new Yt,this.bindMatrixInverse=new Yt,this.boundingBox=null,this.boundingSphere=null}computeBoundingBox(){const t=this.geometry;this.boundingBox===null&&(this.boundingBox=new rn),this.boundingBox.makeEmpty();const e=t.getAttribute("position");for(let n=0;n<e.count;n++)this.getVertexPosition(n,ho),this.boundingBox.expandByPoint(ho)}computeBoundingSphere(){const t=this.geometry;this.boundingSphere===null&&(this.boundingSphere=new Ye),this.boundingSphere.makeEmpty();const e=t.getAttribute("position");for(let n=0;n<e.count;n++)this.getVertexPosition(n,ho),this.boundingSphere.expandByPoint(ho)}copy(t,e){return super.copy(t,e),this.bindMode=t.bindMode,this.bindMatrix.copy(t.bindMatrix),this.bindMatrixInverse.copy(t.bindMatrixInverse),this.skeleton=t.skeleton,t.boundingBox!==null&&(this.boundingBox=t.boundingBox.clone()),t.boundingSphere!==null&&(this.boundingSphere=t.boundingSphere.clone()),this}raycast(t,e){const n=this.material,i=this.matrixWorld;n!==void 0&&(this.boundingSphere===null&&this.computeBoundingSphere(),Jc.copy(this.boundingSphere),Jc.applyMatrix4(i),t.ray.intersectsSphere(Jc)!==!1&&(Ad.copy(i).invert(),Kc.copy(t.ray).applyMatrix4(Ad),!(this.boundingBox!==null&&Kc.intersectsBox(this.boundingBox)===!1)&&this._computeIntersections(t,e,Kc)))}getVertexPosition(t,e){return super.getVertexPosition(t,e),this.applyBoneTransform(t,e),e}bind(t,e){this.skeleton=t,e===void 0&&(this.updateMatrixWorld(!0),this.skeleton.calculateInverses(),e=this.matrixWorld),this.bindMatrix.copy(e),this.bindMatrixInverse.copy(e).invert()}pose(){this.skeleton.pose()}normalizeSkinWeights(){const t=new xe,e=this.geometry.attributes.skinWeight;for(let n=0,i=e.count;n<i;n++){t.fromBufferAttribute(e,n);const r=1/t.manhattanLength();r!==1/0?t.multiplyScalar(r):t.set(1,0,0,0),e.setXYZW(n,t.x,t.y,t.z,t.w)}}updateMatrixWorld(t){super.updateMatrixWorld(t),this.bindMode===bh?this.bindMatrixInverse.copy(this.matrixWorld).invert():this.bindMode===up?this.bindMatrixInverse.copy(this.bindMatrix).invert():pt("SkinnedMesh: Unrecognized bindMode: "+this.bindMode)}applyBoneTransform(t,e){const n=this.skeleton,i=this.geometry;Sd.fromBufferAttribute(i.attributes.skinIndex,t),bd.fromBufferAttribute(i.attributes.skinWeight,t),e.isVector4?(Or.copy(e),e.set(0,0,0,0)):(Or.set(...e,1),e.set(0,0,0)),Or.applyMatrix4(this.bindMatrix);for(let r=0;r<4;r++){const a=bd.getComponent(r);if(a!==0){const o=Sd.getComponent(r);wd.multiplyMatrices(n.bones[o].matrixWorld,n.boneInverses[o]),e.addScaledVector(r_.copy(Or).applyMatrix4(wd),a)}}return e.isVector4&&(e.w=Or.w),e.applyMatrix4(this.bindMatrixInverse)}}class hu extends he{constructor(){super(),this.isBone=!0,this.type="Bone"}}class Nn extends Ce{constructor(t=null,e=1,n=1,i,r,a,o,l,c=Be,h=Be,f,u){super(null,a,o,l,c,h,i,r,f,u),this.isDataTexture=!0,this.image={data:t,width:e,height:n},this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}}const Td=new Yt,a_=new Yt;class nc{constructor(t=[],e=[]){this.uuid=Cn(),this.bones=t.slice(0),this.boneInverses=e,this.boneMatrices=null,this.boneTexture=null,this.init()}init(){const t=this.bones,e=this.boneInverses;if(this.boneMatrices=new Float32Array(t.length*16),e.length===0)this.calculateInverses();else if(t.length!==e.length){pt("Skeleton: Number of inverse bone matrices does not match amount of bones."),this.boneInverses=[];for(let n=0,i=this.bones.length;n<i;n++)this.boneInverses.push(new Yt)}}calculateInverses(){this.boneInverses.length=0;for(let t=0,e=this.bones.length;t<e;t++){const n=new Yt;this.bones[t]&&n.copy(this.bones[t].matrixWorld).invert(),this.boneInverses.push(n)}}pose(){for(let t=0,e=this.bones.length;t<e;t++){const n=this.bones[t];n&&n.matrixWorld.copy(this.boneInverses[t]).invert()}for(let t=0,e=this.bones.length;t<e;t++){const n=this.bones[t];n&&(n.parent&&n.parent.isBone?(n.matrix.copy(n.parent.matrixWorld).invert(),n.matrix.multiply(n.matrixWorld)):n.matrix.copy(n.matrixWorld),n.matrix.decompose(n.position,n.quaternion,n.scale))}}update(){const t=this.bones,e=this.boneInverses,n=this.boneMatrices,i=this.boneTexture;for(let r=0,a=t.length;r<a;r++){const o=t[r]?t[r].matrixWorld:a_;Td.multiplyMatrices(o,e[r]),Td.toArray(n,r*16)}i!==null&&(i.needsUpdate=!0)}clone(){return new nc(this.bones,this.boneInverses)}computeBoneTexture(){let t=Math.sqrt(this.bones.length*4);t=Math.ceil(t/4)*4,t=Math.max(t,4);const e=new Float32Array(t*t*4);e.set(this.boneMatrices);const n=new Nn(e,t,t,dn,un);return n.needsUpdate=!0,this.boneMatrices=e,this.boneTexture=n,this}getBoneByName(t){for(let e=0,n=this.bones.length;e<n;e++){const i=this.bones[e];if(i.name===t)return i}}dispose(){this.boneTexture!==null&&(this.boneTexture.dispose(),this.boneTexture=null)}fromJSON(t,e){this.uuid=t.uuid;for(let n=0,i=t.bones.length;n<i;n++){const r=t.bones[n];let a=e[r];a===void 0&&(pt("Skeleton: No bone found with UUID:",r),a=new hu),this.bones.push(a),this.boneInverses.push(new Yt().fromArray(t.boneInverses[n]))}return this.init(),this}toJSON(){const t={metadata:{version:4.7,type:"Skeleton",generator:"Skeleton.toJSON"},bones:[],boneInverses:[]};t.uuid=this.uuid;const e=this.bones,n=this.boneInverses;for(let i=0,r=e.length;i<r;i++){const a=e[i];t.bones.push(a.uuid);const o=n[i];t.boneInverses.push(o.toArray())}return t}}class _r extends ue{constructor(t,e,n,i=1){super(t,e,n),this.isInstancedBufferAttribute=!0,this.meshPerAttribute=i}copy(t){return super.copy(t),this.meshPerAttribute=t.meshPerAttribute,this}toJSON(){const t=super.toJSON();return t.meshPerAttribute=this.meshPerAttribute,t.isInstancedBufferAttribute=!0,t}}const Js=new Yt,Ed=new Yt,uo=[],Cd=new rn,o_=new Yt,Br=new be,zr=new Ye;class Dp extends be{constructor(t,e,n){super(t,e),this.isInstancedMesh=!0,this.instanceMatrix=new _r(new Float32Array(n*16),16),this.instanceColor=null,this.morphTexture=null,this.count=n,this.boundingBox=null,this.boundingSphere=null;for(let i=0;i<n;i++)this.setMatrixAt(i,o_)}computeBoundingBox(){const t=this.geometry,e=this.count;this.boundingBox===null&&(this.boundingBox=new rn),t.boundingBox===null&&t.computeBoundingBox(),this.boundingBox.makeEmpty();for(let n=0;n<e;n++)this.getMatrixAt(n,Js),Cd.copy(t.boundingBox).applyMatrix4(Js),this.boundingBox.union(Cd)}computeBoundingSphere(){const t=this.geometry,e=this.count;this.boundingSphere===null&&(this.boundingSphere=new Ye),t.boundingSphere===null&&t.computeBoundingSphere(),this.boundingSphere.makeEmpty();for(let n=0;n<e;n++)this.getMatrixAt(n,Js),zr.copy(t.boundingSphere).applyMatrix4(Js),this.boundingSphere.union(zr)}copy(t,e){return super.copy(t,e),this.instanceMatrix.copy(t.instanceMatrix),t.morphTexture!==null&&(this.morphTexture=t.morphTexture.clone()),t.instanceColor!==null&&(this.instanceColor=t.instanceColor.clone()),this.count=t.count,t.boundingBox!==null&&(this.boundingBox=t.boundingBox.clone()),t.boundingSphere!==null&&(this.boundingSphere=t.boundingSphere.clone()),this}getColorAt(t,e){return this.instanceColor===null?e.setRGB(1,1,1):e.fromArray(this.instanceColor.array,t*3)}getMatrixAt(t,e){return e.fromArray(this.instanceMatrix.array,t*16)}getMorphAt(t,e){const n=e.morphTargetInfluences,i=this.morphTexture.source.data.data,r=n.length+1,a=t*r+1;for(let o=0;o<n.length;o++)n[o]=i[a+o]}raycast(t,e){const n=this.matrixWorld,i=this.count;if(Br.geometry=this.geometry,Br.material=this.material,Br.material!==void 0&&(this.boundingSphere===null&&this.computeBoundingSphere(),zr.copy(this.boundingSphere),zr.applyMatrix4(n),t.ray.intersectsSphere(zr)!==!1))for(let r=0;r<i;r++){this.getMatrixAt(r,Js),Ed.multiplyMatrices(n,Js),Br.matrixWorld=Ed,Br.raycast(t,uo);for(let a=0,o=uo.length;a<o;a++){const l=uo[a];l.instanceId=r,l.object=this,e.push(l)}uo.length=0}}setColorAt(t,e){return this.instanceColor===null&&(this.instanceColor=new _r(new Float32Array(this.instanceMatrix.count*3).fill(1),3)),e.toArray(this.instanceColor.array,t*3),this}setMatrixAt(t,e){return e.toArray(this.instanceMatrix.array,t*16),this}setMorphAt(t,e){const n=e.morphTargetInfluences,i=n.length+1;this.morphTexture===null&&(this.morphTexture=new Nn(new Float32Array(i*this.count),i,this.count,Wl,un));const r=this.morphTexture.source.data.data;let a=0;for(let c=0;c<n.length;c++)a+=n[c];const o=this.geometry.morphTargetsRelative?1:1-a,l=i*t;return r[l]=o,r.set(n,l+1),this}updateMorphTargets(){}dispose(){super.dispose(),this.morphTexture!==null&&(this.morphTexture.dispose(),this.morphTexture=null)}}const os=new Ye,l_=new it(.5,.5),fo=new I;class Es{constructor(t=new Mi,e=new Mi,n=new Mi,i=new Mi,r=new Mi,a=new Mi){this.planes=[t,e,n,i,r,a]}set(t,e,n,i,r,a){const o=this.planes;return o[0].copy(t),o[1].copy(e),o[2].copy(n),o[3].copy(i),o[4].copy(r),o[5].copy(a),this}copy(t){const e=this.planes;for(let n=0;n<6;n++)e[n].copy(t.planes[n]);return this}setFromProjectionMatrix(t,e=En,n=!1){const i=this.planes,r=t.elements,a=r[0],o=r[1],l=r[2],c=r[3],h=r[4],f=r[5],u=r[6],d=r[7],p=r[8],_=r[9],g=r[10],m=r[11],x=r[12],M=r[13],y=r[14],w=r[15];if(i[0].setComponents(c-a,d-h,m-p,w-x).normalize(),i[1].setComponents(c+a,d+h,m+p,w+x).normalize(),i[2].setComponents(c+o,d+f,m+_,w+M).normalize(),i[3].setComponents(c-o,d-f,m-_,w-M).normalize(),n)i[4].setComponents(l,u,g,y).normalize(),i[5].setComponents(c-l,d-u,m-g,w-y).normalize();else if(i[4].setComponents(c-l,d-u,m-g,w-y).normalize(),e===En)i[5].setComponents(c+l,d+u,m+g,w+y).normalize();else if(e===As)i[5].setComponents(l,u,g,y).normalize();else throw new Error("THREE.Frustum.setFromProjectionMatrix(): Invalid coordinate system: "+e);return this}intersectsObject(t){if(t.boundingSphere!==void 0)t.boundingSphere===null&&t.computeBoundingSphere(),os.copy(t.boundingSphere).applyMatrix4(t.matrixWorld);else{const e=t.geometry;e.boundingSphere===null&&e.computeBoundingSphere(),os.copy(e.boundingSphere).applyMatrix4(t.matrixWorld)}return this.intersectsSphere(os)}intersectsSprite(t){os.center.set(0,0,0);const e=l_.distanceTo(t.center);return os.radius=.7071067811865476+e,os.applyMatrix4(t.matrixWorld),this.intersectsSphere(os)}intersectsSphere(t){const e=this.planes,n=t.center,i=-t.radius;for(let r=0;r<6;r++)if(e[r].distanceToPoint(n)<i)return!1;return!0}intersectsBox(t){const e=this.planes;for(let n=0;n<6;n++){const i=e[n];if(fo.x=i.normal.x>0?t.max.x:t.min.x,fo.y=i.normal.y>0?t.max.y:t.min.y,fo.z=i.normal.z>0?t.max.z:t.min.z,i.distanceToPoint(fo)<0)return!1}return!0}containsPoint(t){const e=this.planes;for(let n=0;n<6;n++)if(e[n].distanceToPoint(t)<0)return!1;return!0}clone(){return new this.constructor().copy(this)}}const Rd=new Yt;class ic{constructor(){this.coordinateSystem=En,this._frustums=[],this._count=0}setFromArrayCamera(t){const e=t.cameras,n=this._frustums;for(let i=0;i<e.length;i++){const r=e[i];Rd.multiplyMatrices(r.projectionMatrix,r.matrixWorldInverse),n[i]===void 0&&(n[i]=new Es),n[i].setFromProjectionMatrix(Rd,r.coordinateSystem,r.reversedDepth)}return this._count=e.length,this}intersectsObject(t){const e=this._frustums;for(let n=0;n<this._count;n++)if(e[n].intersectsObject(t))return!0;return!1}intersectsSprite(t){const e=this._frustums;for(let n=0;n<this._count;n++)if(e[n].intersectsSprite(t))return!0;return!1}intersectsSphere(t){const e=this._frustums;for(let n=0;n<this._count;n++)if(e[n].intersectsSphere(t))return!0;return!1}intersectsBox(t){const e=this._frustums;for(let n=0;n<this._count;n++)if(e[n].intersectsBox(t))return!0;return!1}containsPoint(t){const e=this._frustums;for(let n=0;n<this._count;n++)if(e[n].containsPoint(t))return!0;return!1}copy(t){this.coordinateSystem=t.coordinateSystem;const e=this._frustums,n=t._frustums;for(let i=0;i<t._count;i++)e[i]===void 0&&(e[i]=new Es),e[i].copy(n[i]);return this._count=t._count,this}clone(){return new ic().copy(this)}}function Qc(s,t){return s-t}function c_(s,t){return s.z-t.z}function h_(s,t){return t.z-s.z}class u_{constructor(){this.index=0,this.pool=[],this.list=[]}push(t,e,n,i){const r=this.pool,a=this.list;this.index>=r.length&&r.push({start:-1,count:-1,z:-1,index:-1});const o=r[this.index];a.push(o),this.index++,o.start=t,o.count=e,o.z=n,o.index=i}reset(){this.list.length=0,this.index=0}}const mn=new Yt,d_=new ut(1,1,1),f_=new Es,p_=new ic,po=new rn,ls=new Ye,kr=new I,Id=new I,m_=new I,jc=new u_,Qe=new be,mo=[];function g_(s,t,e=0){const n=t.itemSize;if(s.isInterleavedBufferAttribute||s.array.constructor!==t.array.constructor){const i=s.count;for(let r=0;r<i;r++)for(let a=0;a<n;a++)t.setComponent(r+e,a,s.getComponent(r,a))}else t.array.set(s.array,e*n);t.needsUpdate=!0}function cs(s,t){if(s.constructor!==t.constructor){const e=Math.min(s.length,t.length);for(let n=0;n<e;n++)t[n]=s[n]}else{const e=Math.min(s.length,t.length);t.set(new s.constructor(s.buffer,0,e))}}class uu extends be{constructor(t,e,n=e*2,i){super(new Zt,i),this.isBatchedMesh=!0,this.perObjectFrustumCulled=!0,this.sortObjects=!0,this.boundingBox=null,this.boundingSphere=null,this.customSort=null,this._instanceInfo=[],this._geometryInfo=[],this._availableInstanceIds=[],this._availableGeometryIds=[],this._nextIndexStart=0,this._nextVertexStart=0,this._geometryCount=0,this._visibilityChanged=!0,this._geometryInitialized=!1,this._maxInstanceCount=t,this._maxVertexCount=e,this._maxIndexCount=n,this._multiDrawCounts=new Int32Array(t),this._multiDrawStarts=new Int32Array(t),this._multiDrawCount=0,this._multiDrawBytesPerElement=1,this._matricesTexture=null,this._indirectTexture=null,this._colorsTexture=null,this._initMatricesTexture(),this._initIndirectTexture()}get maxInstanceCount(){return this._maxInstanceCount}get instanceCount(){return this._instanceInfo.length-this._availableInstanceIds.length}get unusedVertexCount(){return this._maxVertexCount-this._nextVertexStart}get unusedIndexCount(){return this._maxIndexCount-this._nextIndexStart}_initMatricesTexture(){let t=Math.sqrt(this._maxInstanceCount*4);t=Math.ceil(t/4)*4,t=Math.max(t,4);const e=new Float32Array(t*t*4),n=new Nn(e,t,t,dn,un);this._matricesTexture=n}_initIndirectTexture(){let t=Math.sqrt(this._maxInstanceCount);t=Math.ceil(t);const e=new Uint32Array(t*t),n=new Nn(e,t,t,Na,Un);this._indirectTexture=n}_initColorsTexture(){let t=Math.sqrt(this._maxInstanceCount);t=Math.ceil(t);const e=new Float32Array(t*t*4).fill(1),n=new Nn(e,t,t,dn,un);n.colorSpace=ae.workingColorSpace,this._colorsTexture=n}_initializeGeometry(t){const e=this.geometry,n=this._maxVertexCount,i=this._maxIndexCount;if(this._geometryInitialized===!1){for(const r in t.attributes){const a=t.getAttribute(r),{array:o,itemSize:l,normalized:c}=a,h=new o.constructor(n*l),f=new ue(h,l,c);e.setAttribute(r,f)}if(t.getIndex()!==null){const r=n>65535?new Uint32Array(i):new Uint16Array(i);e.setIndex(new ue(r,1))}this._geometryInitialized=!0}}_validateGeometry(t){const e=this.geometry;if(!!t.getIndex()!=!!e.getIndex())throw new Error('THREE.BatchedMesh: All geometries must consistently have "index".');for(const n in e.attributes){if(!t.hasAttribute(n))throw new Error(`THREE.BatchedMesh: Added geometry missing "${n}". All geometries must have consistent attributes.`);const i=t.getAttribute(n),r=e.getAttribute(n);if(i.itemSize!==r.itemSize||i.normalized!==r.normalized)throw new Error("THREE.BatchedMesh: All attributes must have a consistent itemSize and normalized value.")}}validateInstanceId(t){const e=this._instanceInfo;if(t<0||t>=e.length||e[t].active===!1)throw new Error(`THREE.BatchedMesh: Invalid instanceId ${t}. Instance is either out of range or has been deleted.`)}validateGeometryId(t){const e=this._geometryInfo;if(t<0||t>=e.length||e[t].active===!1)throw new Error(`THREE.BatchedMesh: Invalid geometryId ${t}. Geometry is either out of range or has been deleted.`)}setCustomSort(t){return this.customSort=t,this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new rn);const t=this.boundingBox,e=this._instanceInfo;t.makeEmpty();for(let n=0,i=e.length;n<i;n++){if(e[n].active===!1)continue;const r=e[n].geometryIndex;this.getMatrixAt(n,mn),this.getBoundingBoxAt(r,po).applyMatrix4(mn),t.union(po)}}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new Ye);const t=this.boundingSphere,e=this._instanceInfo;t.makeEmpty();for(let n=0,i=e.length;n<i;n++){if(e[n].active===!1)continue;const r=e[n].geometryIndex;this.getMatrixAt(n,mn),this.getBoundingSphereAt(r,ls).applyMatrix4(mn),t.union(ls)}}addInstance(t){if(this._instanceInfo.length>=this.maxInstanceCount&&this._availableInstanceIds.length===0)throw new Error("THREE.BatchedMesh: Maximum item count reached.");const n={visible:!0,active:!0,geometryIndex:t};let i=null;this._availableInstanceIds.length>0?(this._availableInstanceIds.sort(Qc),i=this._availableInstanceIds.shift(),this._instanceInfo[i]=n):(i=this._instanceInfo.length,this._instanceInfo.push(n));const r=this._matricesTexture;mn.identity().toArray(r.image.data,i*16),r.needsUpdate=!0;const a=this._colorsTexture;return a&&(d_.toArray(a.image.data,i*4),a.needsUpdate=!0),this._visibilityChanged=!0,i}addGeometry(t,e=-1,n=-1){this._initializeGeometry(t),this._validateGeometry(t);const i={vertexStart:-1,vertexCount:-1,reservedVertexCount:-1,indexStart:-1,indexCount:-1,reservedIndexCount:-1,start:-1,count:-1,boundingBox:null,boundingSphere:null,active:!0},r=this._geometryInfo;i.vertexStart=this._nextVertexStart,i.reservedVertexCount=e===-1?t.getAttribute("position").count:e;const a=t.getIndex();if(a!==null&&(i.indexStart=this._nextIndexStart,i.reservedIndexCount=n===-1?a.count:n),i.indexStart!==-1&&i.indexStart+i.reservedIndexCount>this._maxIndexCount||i.vertexStart+i.reservedVertexCount>this._maxVertexCount)throw new Error("THREE.BatchedMesh: Reserved space request exceeds the maximum buffer size.");let l;return this._availableGeometryIds.length>0?(this._availableGeometryIds.sort(Qc),l=this._availableGeometryIds.shift(),r[l]=i):(l=this._geometryCount,this._geometryCount++,r.push(i)),this.setGeometryAt(l,t),this._nextIndexStart=i.indexStart+i.reservedIndexCount,this._nextVertexStart=i.vertexStart+i.reservedVertexCount,l}setGeometryAt(t,e){if(t>=this._geometryCount)throw new Error("THREE.BatchedMesh: Maximum geometry count reached.");this._validateGeometry(e);const n=this.geometry,i=n.getIndex()!==null,r=n.getIndex(),a=e.getIndex(),o=this._geometryInfo[t];if(i&&a.count>o.reservedIndexCount||e.attributes.position.count>o.reservedVertexCount)throw new Error("THREE.BatchedMesh: Reserved space not large enough for provided geometry.");const l=o.vertexStart,c=o.reservedVertexCount;o.vertexCount=e.getAttribute("position").count;for(const h in n.attributes){const f=e.getAttribute(h),u=n.getAttribute(h);g_(f,u,l);const d=f.itemSize;for(let p=f.count,_=c;p<_;p++){const g=l+p;for(let m=0;m<d;m++)u.setComponent(g,m,0)}u.needsUpdate=!0,u.addUpdateRange(l*d,c*d)}if(i){const h=o.indexStart,f=o.reservedIndexCount;o.indexCount=e.getIndex().count;for(let u=0;u<a.count;u++)r.setX(h+u,l+a.getX(u));for(let u=a.count,d=f;u<d;u++)r.setX(h+u,l);r.needsUpdate=!0,r.addUpdateRange(h,o.reservedIndexCount)}return o.start=i?o.indexStart:o.vertexStart,o.count=i?o.indexCount:o.vertexCount,o.boundingBox=null,e.boundingBox!==null&&(o.boundingBox=e.boundingBox.clone()),o.boundingSphere=null,e.boundingSphere!==null&&(o.boundingSphere=e.boundingSphere.clone()),this._visibilityChanged=!0,t}deleteGeometry(t){const e=this._geometryInfo;if(t>=e.length||e[t].active===!1)return this;const n=this._instanceInfo;for(let i=0,r=n.length;i<r;i++)n[i].active&&n[i].geometryIndex===t&&this.deleteInstance(i);return e[t].active=!1,this._availableGeometryIds.push(t),this._visibilityChanged=!0,this}deleteInstance(t){return this.validateInstanceId(t),this._instanceInfo[t].active=!1,this._availableInstanceIds.push(t),this._visibilityChanged=!0,this}optimize(){let t=0,e=0;const n=this._geometryInfo,i=n.map((a,o)=>o).sort((a,o)=>n[a].vertexStart-n[o].vertexStart),r=this.geometry;for(let a=0,o=n.length;a<o;a++){const l=i[a],c=n[l];if(c.active!==!1){if(r.index!==null){if(c.indexStart!==e){const{indexStart:h,vertexStart:f,reservedIndexCount:u}=c,d=r.index,p=d.array,_=t-f;for(let g=h;g<h+u;g++)p[g]=p[g]+_;d.array.copyWithin(e,h,h+u),d.addUpdateRange(e,u),d.needsUpdate=!0,c.indexStart=e}e+=c.reservedIndexCount}if(c.vertexStart!==t){const{vertexStart:h,reservedVertexCount:f}=c,u=r.attributes;for(const d in u){const p=u[d],{array:_,itemSize:g}=p;_.copyWithin(t*g,h*g,(h+f)*g),p.addUpdateRange(t*g,f*g),p.needsUpdate=!0}c.vertexStart=t}t+=c.reservedVertexCount,c.start=r.index?c.indexStart:c.vertexStart}}return this._nextIndexStart=e,this._nextVertexStart=t,this._visibilityChanged=!0,this}getBoundingBoxAt(t,e){if(t>=this._geometryCount)return null;const n=this.geometry,i=this._geometryInfo[t];if(i.boundingBox===null){const r=new rn,a=n.index,o=n.attributes.position;for(let l=i.start,c=i.start+i.count;l<c;l++){let h=l;a&&(h=a.getX(h)),r.expandByPoint(kr.fromBufferAttribute(o,h))}i.boundingBox=r}return e.copy(i.boundingBox),e}getBoundingSphereAt(t,e){if(t>=this._geometryCount)return null;const n=this.geometry,i=this._geometryInfo[t];if(i.boundingSphere===null){const r=new Ye;this.getBoundingBoxAt(t,po),po.getCenter(r.center);const a=n.index,o=n.attributes.position;let l=0;for(let c=i.start,h=i.start+i.count;c<h;c++){let f=c;a&&(f=a.getX(f)),kr.fromBufferAttribute(o,f),l=Math.max(l,r.center.distanceToSquared(kr))}r.radius=Math.sqrt(l),i.boundingSphere=r}return e.copy(i.boundingSphere),e}setMatrixAt(t,e){this.validateInstanceId(t);const n=this._matricesTexture,i=this._matricesTexture.image.data;return e.toArray(i,t*16),n.needsUpdate=!0,this}getMatrixAt(t,e){return this.validateInstanceId(t),e.fromArray(this._matricesTexture.image.data,t*16)}setColorAt(t,e){return this.validateInstanceId(t),this._colorsTexture===null&&this._initColorsTexture(),e.toArray(this._colorsTexture.image.data,t*4),this._colorsTexture.needsUpdate=!0,this}getColorAt(t,e){return this.validateInstanceId(t),this._colorsTexture===null?e.isVector4?e.set(1,1,1,1):e.setRGB(1,1,1):e.fromArray(this._colorsTexture.image.data,t*4)}setVisibleAt(t,e){return this.validateInstanceId(t),this._instanceInfo[t].visible===e?this:(this._instanceInfo[t].visible=e,this._visibilityChanged=!0,this)}getVisibleAt(t){return this.validateInstanceId(t),this._instanceInfo[t].visible}setGeometryIdAt(t,e){return this.validateInstanceId(t),this.validateGeometryId(e),this._instanceInfo[t].geometryIndex=e,this._visibilityChanged=!0,this}getGeometryIdAt(t){return this.validateInstanceId(t),this._instanceInfo[t].geometryIndex}getGeometryRangeAt(t,e={}){this.validateGeometryId(t);const n=this._geometryInfo[t];return e.vertexStart=n.vertexStart,e.vertexCount=n.vertexCount,e.reservedVertexCount=n.reservedVertexCount,e.indexStart=n.indexStart,e.indexCount=n.indexCount,e.reservedIndexCount=n.reservedIndexCount,e.start=n.start,e.count=n.count,e}setInstanceCount(t){const e=this._availableInstanceIds,n=this._instanceInfo;for(e.sort(Qc);e[e.length-1]===n.length-1;)n.pop(),e.pop();if(t<n.length)throw new Error(`THREE.BatchedMesh: Instance ids outside the range ${t} are being used. Cannot shrink instance count.`);const i=new Int32Array(t),r=new Int32Array(t);cs(this._multiDrawCounts,i),cs(this._multiDrawStarts,r),this._multiDrawCounts=i,this._multiDrawStarts=r,this._maxInstanceCount=t;const a=this._indirectTexture,o=this._matricesTexture,l=this._colorsTexture;a.dispose(),this._initIndirectTexture(),cs(a.image.data,this._indirectTexture.image.data),o.dispose(),this._initMatricesTexture(),cs(o.image.data,this._matricesTexture.image.data),l&&(l.dispose(),this._initColorsTexture(),cs(l.image.data,this._colorsTexture.image.data))}setGeometrySize(t,e){const n=[...this._geometryInfo].filter(o=>o.active);if(Math.max(...n.map(o=>o.vertexStart+o.reservedVertexCount))>t)throw new Error(`THREE.BatchedMesh: Geometry vertex values are being used outside the range ${e}. Cannot shrink further.`);if(this.geometry.index&&Math.max(...n.map(l=>l.indexStart+l.reservedIndexCount))>e)throw new Error(`THREE.BatchedMesh: Geometry index values are being used outside the range ${e}. Cannot shrink further.`);const r=this.geometry;r.dispose(),this._maxVertexCount=t,this._maxIndexCount=e,this._geometryInitialized&&(this._geometryInitialized=!1,this.geometry=new Zt,this._initializeGeometry(r));const a=this.geometry;r.index&&cs(r.index.array,a.index.array);for(const o in r.attributes)cs(r.attributes[o].array,a.attributes[o].array)}raycast(t,e){const n=this._instanceInfo,i=this._geometryInfo,r=this.matrixWorld,a=this.geometry;Qe.material=this.material,Qe.geometry.index=a.index,Qe.geometry.attributes=a.attributes,Qe.geometry.boundingBox===null&&(Qe.geometry.boundingBox=new rn),Qe.geometry.boundingSphere===null&&(Qe.geometry.boundingSphere=new Ye);for(let o=0,l=n.length;o<l;o++){if(!n[o].visible||!n[o].active)continue;const c=n[o].geometryIndex,h=i[c];Qe.geometry.setDrawRange(h.start,h.count),this.getMatrixAt(o,Qe.matrixWorld).premultiply(r),this.getBoundingBoxAt(c,Qe.geometry.boundingBox),this.getBoundingSphereAt(c,Qe.geometry.boundingSphere),Qe.raycast(t,mo);for(let f=0,u=mo.length;f<u;f++){const d=mo[f];d.object=this,d.batchId=o,e.push(d)}mo.length=0}Qe.material=null,Qe.geometry.index=null,Qe.geometry.attributes={},Qe.geometry.setDrawRange(0,1/0)}copy(t){return super.copy(t),this.geometry=t.geometry.clone(),this.perObjectFrustumCulled=t.perObjectFrustumCulled,this.sortObjects=t.sortObjects,this.boundingBox=t.boundingBox!==null?t.boundingBox.clone():null,this.boundingSphere=t.boundingSphere!==null?t.boundingSphere.clone():null,this._geometryInfo=t._geometryInfo.map(e=>({...e,boundingBox:e.boundingBox!==null?e.boundingBox.clone():null,boundingSphere:e.boundingSphere!==null?e.boundingSphere.clone():null})),this._instanceInfo=t._instanceInfo.map(e=>({...e})),this._availableInstanceIds=t._availableInstanceIds.slice(),this._availableGeometryIds=t._availableGeometryIds.slice(),this._nextIndexStart=t._nextIndexStart,this._nextVertexStart=t._nextVertexStart,this._geometryCount=t._geometryCount,this._maxInstanceCount=t._maxInstanceCount,this._maxVertexCount=t._maxVertexCount,this._maxIndexCount=t._maxIndexCount,this._geometryInitialized=t._geometryInitialized,this._multiDrawCounts=t._multiDrawCounts.slice(),this._multiDrawStarts=t._multiDrawStarts.slice(),this._multiDrawBytesPerElement=t._multiDrawBytesPerElement,this._indirectTexture=t._indirectTexture.clone(),this._indirectTexture.image.data=this._indirectTexture.image.data.slice(),this._matricesTexture=t._matricesTexture.clone(),this._matricesTexture.image.data=this._matricesTexture.image.data.slice(),this._colorsTexture!==null&&(this._colorsTexture=t._colorsTexture.clone(),this._colorsTexture.image.data=this._colorsTexture.image.data.slice()),this}dispose(){super.dispose(),this.geometry.dispose(),this._matricesTexture.dispose(),this._matricesTexture=null,this._indirectTexture.dispose(),this._indirectTexture=null,this._colorsTexture!==null&&(this._colorsTexture.dispose(),this._colorsTexture=null)}onBeforeRender(t,e,n,i,r){if(!this._visibilityChanged&&!this.perObjectFrustumCulled&&!this.sortObjects)return;const a=i.getIndex();let o=a===null?1:a.array.BYTES_PER_ELEMENT,l=1;r.wireframe&&(l=2,o=i.attributes.position.count>65535?4:2);const c=this._instanceInfo,h=this._multiDrawStarts,f=this._multiDrawCounts,u=this._geometryInfo,d=this.perObjectFrustumCulled,p=this._indirectTexture,_=p.image.data,g=n.isArrayCamera?p_:f_;d&&(n.isArrayCamera?g.setFromArrayCamera(n):(mn.multiplyMatrices(n.projectionMatrix,n.matrixWorldInverse).multiply(this.matrixWorld),g.setFromProjectionMatrix(mn,n.coordinateSystem,n.reversedDepth)));let m=0;if(this.sortObjects){mn.copy(this.matrixWorld).invert(),kr.setFromMatrixPosition(n.matrixWorld).applyMatrix4(mn),Id.set(0,0,-1).transformDirection(n.matrixWorld).transformDirection(mn);for(let y=0,w=c.length;y<w;y++)if(c[y].visible&&c[y].active){const b=c[y].geometryIndex;this.getMatrixAt(y,mn),this.getBoundingSphereAt(b,ls).applyMatrix4(mn);let E=!1;if(d&&(E=!g.intersectsSphere(ls)),!E){const v=u[b],T=m_.subVectors(ls.center,kr).dot(Id);jc.push(v.start,v.count,T,y)}}const x=jc.list,M=this.customSort;M===null?x.sort(r.transparent?h_:c_):M.call(this,x,n);for(let y=0,w=x.length;y<w;y++){const b=x[y];h[m]=b.start*o*l,f[m]=b.count*l,_[m]=b.index,m++}jc.reset()}else for(let x=0,M=c.length;x<M;x++)if(c[x].visible&&c[x].active){const y=c[x].geometryIndex;let w=!1;if(d&&(this.getMatrixAt(x,mn),this.getBoundingSphereAt(y,ls).applyMatrix4(mn),w=!g.intersectsSphere(ls)),!w){const b=u[y];h[m]=b.start*o*l,f[m]=b.count*l,_[m]=x,m++}}p.needsUpdate=!0,this._multiDrawCount=m,this._multiDrawBytesPerElement=o,this._visibilityChanged=!1}onBeforeShadow(t,e,n,i,r,a){this.onBeforeRender(t,null,i,r,a)}}class pn extends Ze{constructor(t){super(),this.isLineBasicMaterial=!0,this.type="LineBasicMaterial",this.color=new ut(16777215),this.map=null,this.linewidth=1,this.linecap="round",this.linejoin="round",this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.color.copy(t.color),this.map=t.map,this.linewidth=t.linewidth,this.linecap=t.linecap,this.linejoin=t.linejoin,this.fog=t.fog,this}}const Rl=new I,Il=new I,Pd=new Yt,Vr=new wr,go=new Ye,th=new I,Ld=new I;class Qi extends he{constructor(t=new Zt,e=new pn){super(),this.isLine=!0,this.type="Line",this.geometry=t,this.material=e,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.updateMorphTargets()}copy(t,e){return super.copy(t,e),this.material=Array.isArray(t.material)?t.material.slice():t.material,this.geometry=t.geometry,this}computeLineDistances(){const t=this.geometry;if(t.index===null){const e=t.attributes.position,n=[0];for(let i=1,r=e.count;i<r;i++)Rl.fromBufferAttribute(e,i-1),Il.fromBufferAttribute(e,i),n[i]=n[i-1],n[i]+=Rl.distanceTo(Il);t.setAttribute("lineDistance",new Mt(n,1))}else pt("Line.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.");return this}intersectsFrustum(t){return t.intersectsObject(this)}raycast(t,e){const n=this.geometry,i=this.matrixWorld,r=t.params.Line.threshold,a=n.drawRange;if(n.boundingSphere===null&&n.computeBoundingSphere(),go.copy(n.boundingSphere),go.applyMatrix4(i),go.radius+=r,t.ray.intersectsSphere(go)===!1)return;Pd.copy(i).invert(),Vr.copy(t.ray).applyMatrix4(Pd);const o=r/((this.scale.x+this.scale.y+this.scale.z)/3),l=o*o,c=this.isLineSegments?2:1,h=n.index,u=n.attributes.position;if(h!==null){const d=Math.max(0,a.start),p=Math.min(h.count,a.start+a.count);for(let _=d,g=p-1;_<g;_+=c){const m=h.getX(_),x=h.getX(_+1),M=_o(this,t,Vr,l,m,x,_);M&&e.push(M)}if(this.isLineLoop){const _=h.getX(p-1),g=h.getX(d),m=_o(this,t,Vr,l,_,g,p-1);m&&e.push(m)}}else{const d=Math.max(0,a.start),p=Math.min(u.count,a.start+a.count);for(let _=d,g=p-1;_<g;_+=c){const m=_o(this,t,Vr,l,_,_+1,_);m&&e.push(m)}if(this.isLineLoop){const _=_o(this,t,Vr,l,p-1,d,p-1);_&&e.push(_)}}}updateMorphTargets(){const e=this.geometry.morphAttributes,n=Object.keys(e);if(n.length>0){const i=e[n[0]];if(i!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,a=i.length;r<a;r++){const o=i[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[o]=r}}}}}function _o(s,t,e,n,i,r,a){const o=s.geometry.attributes.position;if(Rl.fromBufferAttribute(o,i),Il.fromBufferAttribute(o,r),e.distanceSqToSegment(Rl,Il,th,Ld)>n)return;th.applyMatrix4(s.matrixWorld);const c=t.ray.origin.distanceTo(th);if(!(c<t.near||c>t.far))return{distance:c,point:Ld.clone().applyMatrix4(s.matrixWorld),index:a,face:null,faceIndex:null,barycoord:null,object:s}}const Dd=new I,Nd=new I;class di extends Qi{constructor(t,e){super(t,e),this.isLineSegments=!0,this.type="LineSegments"}computeLineDistances(){const t=this.geometry;if(t.index===null){const e=t.attributes.position,n=[];for(let i=0,r=e.count;i<r;i+=2)Dd.fromBufferAttribute(e,i),Nd.fromBufferAttribute(e,i+1),n[i]=i===0?0:n[i-1],n[i+1]=n[i]+Dd.distanceTo(Nd);t.setAttribute("lineDistance",new Mt(n,1))}else pt("LineSegments.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.");return this}}class Np extends Qi{constructor(t,e){super(t,e),this.isLineLoop=!0,this.type="LineLoop"}}class du extends Ze{constructor(t){super(),this.isPointsMaterial=!0,this.type="PointsMaterial",this.color=new ut(16777215),this.map=null,this.alphaMap=null,this.size=1,this.sizeAttenuation=!0,this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.color.copy(t.color),this.map=t.map,this.alphaMap=t.alphaMap,this.size=t.size,this.sizeAttenuation=t.sizeAttenuation,this.fog=t.fog,this}}const Ud=new Yt,Th=new wr,xo=new Ye,yo=new I;class Up extends he{constructor(t=new Zt,e=new du){super(),this.isPoints=!0,this.type="Points",this.geometry=t,this.material=e,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.updateMorphTargets()}copy(t,e){return super.copy(t,e),this.material=Array.isArray(t.material)?t.material.slice():t.material,this.geometry=t.geometry,this}intersectsFrustum(t){return t.intersectsObject(this)}raycast(t,e){const n=this.geometry,i=this.matrixWorld,r=t.params.Points.threshold,a=n.drawRange;if(n.boundingSphere===null&&n.computeBoundingSphere(),xo.copy(n.boundingSphere),xo.applyMatrix4(i),xo.radius+=r,t.ray.intersectsSphere(xo)===!1)return;Ud.copy(i).invert(),Th.copy(t.ray).applyMatrix4(Ud);const o=r/((this.scale.x+this.scale.y+this.scale.z)/3),l=o*o,c=n.index,f=n.attributes.position;if(c!==null){const u=Math.max(0,a.start),d=Math.min(c.count,a.start+a.count);for(let p=u,_=d;p<_;p++){const g=c.getX(p);yo.fromBufferAttribute(f,g),Fd(yo,g,l,i,t,e,this)}}else{const u=Math.max(0,a.start),d=Math.min(f.count,a.start+a.count);for(let p=u,_=d;p<_;p++)yo.fromBufferAttribute(f,p),Fd(yo,p,l,i,t,e,this)}}updateMorphTargets(){const e=this.geometry.morphAttributes,n=Object.keys(e);if(n.length>0){const i=e[n[0]];if(i!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,a=i.length;r<a;r++){const o=i[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[o]=r}}}}}function Fd(s,t,e,n,i,r,a){const o=Th.distanceSqToPoint(s);if(o<e){const l=new I;Th.closestPointToPoint(s,l),l.applyMatrix4(n);const c=i.ray.origin.distanceTo(l);if(c<i.near||c>i.far)return;r.push({distance:c,distanceToRay:Math.sqrt(o),point:l,index:t,face:null,faceIndex:null,barycoord:null,object:a})}}class Fp extends Ce{constructor(t,e,n,i,r=Ae,a=Ae,o,l,c){super(t,e,n,i,r,a,o,l,c),this.isVideoTexture=!0,this.generateMipmaps=!1,this._requestVideoFrameCallbackId=0;const h=this;function f(){h.needsUpdate=!0,h._requestVideoFrameCallbackId=t.requestVideoFrameCallback(f)}"requestVideoFrameCallback"in t&&(this._requestVideoFrameCallbackId=t.requestVideoFrameCallback(f))}clone(){return new this.constructor(this.image).copy(this)}update(){const t=this.image;"requestVideoFrameCallback"in t===!1&&t.readyState>=t.HAVE_CURRENT_DATA&&(this.needsUpdate=!0)}dispose(){this._requestVideoFrameCallbackId!==0&&(this.source.data.cancelVideoFrameCallback(this._requestVideoFrameCallbackId),this._requestVideoFrameCallbackId=0),super.dispose()}}class __ extends Fp{constructor(t,e,n,i,r,a,o,l){super({},t,e,n,i,r,a,o,l),this.isVideoFrameTexture=!0}update(){}clone(){return new this.constructor().copy(this)}setFrame(t){this.image=t,this.needsUpdate=!0}}class x_ extends Ce{constructor(t,e){super({width:t,height:e}),this.isFramebufferTexture=!0,this.magFilter=Be,this.minFilter=Be,this.generateMipmaps=!1,this.needsUpdate=!0}}class sc extends Ce{constructor(t,e,n,i,r,a,o,l,c,h,f,u){super(null,a,o,l,c,h,i,r,f,u),this.isCompressedTexture=!0,this.image={width:e,height:n},this.mipmaps=t,this.flipY=!1,this.generateMipmaps=!1}}class y_ extends sc{constructor(t,e,n,i,r,a){super(t,e,n,r,a),this.isCompressedArrayTexture=!0,this.image.depth=i,this.wrapR=yn,this.layerUpdates=new Set}copy(t){return super.copy(t),this.wrapR=t.wrapR,this}addLayerUpdate(t){this.layerUpdates.add(t)}clearLayerUpdates(){this.layerUpdates.clear()}}class v_ extends sc{constructor(t,e,n){super(void 0,t[0].width,t[0].height,e,n,li),this.isCompressedCubeTexture=!0,this.isCubeTexture=!0,this.image=t}}class Fa extends Ce{constructor(t=[],e=li,n,i,r,a,o,l,c,h){super(t,e,n,i,r,a,o,l,c,h),this.isCubeTexture=!0,this.flipY=!1}get images(){return this.image}set images(t){this.image=t}}class M_ extends Ce{constructor(t,e,n,i,r,a,o,l,c){super(t,e,n,i,r,a,o,l,c),this.isCanvasTexture=!0,this.needsUpdate=!0}}class S_ extends Ce{constructor(t,e,n,i,r,a,o,l,c){super(t,e,n,i,r,a,o,l,c),this.isHTMLTexture=!0,this.generateMipmaps=!1,this.needsUpdate=!0;const h=t?t.parentNode:null;h!==null&&"requestPaint"in h&&(h.onpaint=()=>{this.needsUpdate=!0},h.requestPaint())}dispose(){const t=this.image?this.image.parentNode:null;t!==null&&"onpaint"in t&&(t.onpaint=null),super.dispose()}}class xr extends Ce{constructor(t,e,n=Un,i,r,a,o=Be,l=Be,c,h=ci,f=1){if(h!==ci&&h!==Xi)throw new Error("THREE.DepthTexture: format must be either THREE.DepthFormat or THREE.DepthStencilFormat");const u={width:t,height:e,depth:f};super(u,i,r,a,o,l,h,n,c),this.isDepthTexture=!0,this.flipY=!1,this.generateMipmaps=!1,this.compareFunction=null}copy(t){return super.copy(t),this.source=new Ai(Object.assign({},t.image)),this.compareFunction=t.compareFunction,this}toJSON(t){const e=super.toJSON(t);return e.compareFunction=this.compareFunction,e}}class Op extends xr{constructor(t,e=Un,n=li,i,r,a=Be,o=Be,l,c=ci){const h={width:t,height:t,depth:1},f=[h,h,h,h,h,h];super(t,t,e,n,i,r,a,o,l,c),this.image=f,this.isCubeDepthTexture=!0,this.isCubeTexture=!0}get images(){return this.image}set images(t){this.image=t}}class fu extends Ce{constructor(t=null){super(),this.sourceTexture=t,this.isExternalTexture=!0}copy(t){return super.copy(t),this.sourceTexture=t.sourceTexture,this}}class Ni extends Zt{constructor(t=1,e=1,n=1,i=1,r=1,a=1){super(),this.type="BoxGeometry",this.parameters={width:t,height:e,depth:n,widthSegments:i,heightSegments:r,depthSegments:a};const o=this;i=Math.floor(i),r=Math.floor(r),a=Math.floor(a);const l=[],c=[],h=[],f=[];let u=0,d=0;p("z","y","x",-1,-1,n,e,t,a,r,0),p("z","y","x",1,-1,n,e,-t,a,r,1),p("x","z","y",1,1,t,n,e,i,a,2),p("x","z","y",1,-1,t,n,-e,i,a,3),p("x","y","z",1,-1,t,e,n,i,r,4),p("x","y","z",-1,-1,t,e,-n,i,r,5),this.setIndex(l),this.setAttribute("position",new Mt(c,3)),this.setAttribute("normal",new Mt(h,3)),this.setAttribute("uv",new Mt(f,2));function p(_,g,m,x,M,y,w,b,E,v,T){const C=y/E,P=w/v,L=y/2,N=w/2,D=b/2,O=E+1,V=v+1;let z=0,G=0;const X=new I;for(let $=0;$<V;$++){const Z=$*P-N;for(let ct=0;ct<O;ct++){const bt=ct*C-L;X[_]=bt*x,X[g]=Z*M,X[m]=D,c.push(X.x,X.y,X.z),X[_]=0,X[g]=0,X[m]=b>0?1:-1,h.push(X.x,X.y,X.z),f.push(ct/E),f.push(1-$/v),z+=1}}for(let $=0;$<v;$++)for(let Z=0;Z<E;Z++){const ct=u+Z+O*$,bt=u+Z+O*($+1),$t=u+(Z+1)+O*($+1),Wt=u+(Z+1)+O*$;l.push(ct,bt,Wt),l.push(bt,$t,Wt),G+=6}o.addGroup(d,G,T),d+=G,u+=z}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new Ni(t.width,t.height,t.depth,t.widthSegments,t.heightSegments,t.depthSegments)}}class rc extends Zt{constructor(t=1,e=1,n=4,i=8,r=1){super(),this.type="CapsuleGeometry",this.parameters={radius:t,height:e,capSegments:n,radialSegments:i,heightSegments:r},e=Math.max(0,e),n=Math.max(1,Math.floor(n)),i=Math.max(3,Math.floor(i)),r=Math.max(1,Math.floor(r));const a=[],o=[],l=[],c=[],h=e/2,f=Math.PI/2*t,u=e,d=2*f+u,p=n*2+r,_=i+1,g=new I,m=new I;for(let x=0;x<=p;x++){let M=0,y=0,w=0,b=0;if(x<=n){const T=x/n,C=T*Math.PI/2;y=-h-t*Math.cos(C),w=t*Math.sin(C),b=-t*Math.cos(C),M=T*f}else if(x<=n+r){const T=(x-n)/r;y=-h+T*e,w=t,b=0,M=f+T*u}else{const T=(x-n-r)/n,C=T*Math.PI/2;y=h+t*Math.sin(C),w=t*Math.cos(C),b=t*Math.sin(C),M=f+u+T*f}const E=Math.max(0,Math.min(1,M/d));let v=0;x===0?v=.5/i:x===p&&(v=-.5/i);for(let T=0;T<=i;T++){const C=T/i,P=C*Math.PI*2,L=Math.sin(P),N=Math.cos(P);m.x=-w*N,m.y=y,m.z=w*L,o.push(m.x,m.y,m.z),g.set(-w*N,b,w*L),g.normalize(),l.push(g.x,g.y,g.z),c.push(C+v,E)}if(x>0){const T=(x-1)*_;for(let C=0;C<i;C++){const P=T+C,L=T+C+1,N=x*_+C,D=x*_+C+1;a.push(P,L,N),a.push(L,D,N)}}}this.setIndex(a),this.setAttribute("position",new Mt(o,3)),this.setAttribute("normal",new Mt(l,3)),this.setAttribute("uv",new Mt(c,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new rc(t.radius,t.height,t.capSegments,t.radialSegments,t.heightSegments)}}class Oa extends Zt{constructor(t=1,e=32,n=0,i=Math.PI*2){super(),this.type="CircleGeometry",this.parameters={radius:t,segments:e,thetaStart:n,thetaLength:i},e=Math.max(3,e);const r=[],a=[],o=[],l=[],c=new I,h=new it;a.push(0,0,0),o.push(0,0,1),l.push(.5,.5);for(let f=0,u=3;f<=e;f++,u+=3){const d=n+f/e*i;c.x=t*Math.cos(d),c.y=t*Math.sin(d),a.push(c.x,c.y,c.z),o.push(0,0,1),h.x=(a[u]/t+1)/2,h.y=(a[u+1]/t+1)/2,l.push(h.x,h.y)}for(let f=1;f<=e;f++)r.push(f,f+1,0);this.setIndex(r),this.setAttribute("position",new Mt(a,3)),this.setAttribute("normal",new Mt(o,3)),this.setAttribute("uv",new Mt(l,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new Oa(t.radius,t.segments,t.thetaStart,t.thetaLength)}}class Ar extends Zt{constructor(t=1,e=1,n=1,i=32,r=1,a=!1,o=0,l=Math.PI*2){super(),this.type="CylinderGeometry",this.parameters={radiusTop:t,radiusBottom:e,height:n,radialSegments:i,heightSegments:r,openEnded:a,thetaStart:o,thetaLength:l};const c=this;i=Math.floor(i),r=Math.floor(r);const h=[],f=[],u=[],d=[];let p=0;const _=[],g=n/2;let m=0;x(),a===!1&&(t>0&&M(!0),e>0&&M(!1)),this.setIndex(h),this.setAttribute("position",new Mt(f,3)),this.setAttribute("normal",new Mt(u,3)),this.setAttribute("uv",new Mt(d,2));function x(){const y=new I,w=new I;let b=0;const E=(e-t)/n;for(let v=0;v<=r;v++){const T=[],C=v/r,P=C*(e-t)+t;for(let L=0;L<=i;L++){const N=L/i,D=N*l+o,O=Math.sin(D),V=Math.cos(D);w.x=P*O,w.y=-C*n+g,w.z=P*V,f.push(w.x,w.y,w.z),y.set(O,E,V).normalize(),u.push(y.x,y.y,y.z),d.push(N,1-C),T.push(p++)}_.push(T)}for(let v=0;v<i;v++)for(let T=0;T<r;T++){const C=_[T][v],P=_[T+1][v],L=_[T+1][v+1],N=_[T][v+1];(t>0||T!==0)&&(h.push(C,P,N),b+=3),(e>0||T!==r-1)&&(h.push(P,L,N),b+=3)}c.addGroup(m,b,0),m+=b}function M(y){const w=p,b=new it,E=new I;let v=0;const T=y===!0?t:e,C=y===!0?1:-1;for(let L=1;L<=i;L++)f.push(0,g*C,0),u.push(0,C,0),d.push(.5,.5),p++;const P=p;for(let L=0;L<=i;L++){const D=L/i*l+o,O=Math.cos(D),V=Math.sin(D);E.x=T*V,E.y=g*C,E.z=T*O,f.push(E.x,E.y,E.z),u.push(0,C,0),b.x=O*.5+.5,b.y=V*.5*C+.5,d.push(b.x,b.y),p++}for(let L=0;L<i;L++){const N=w+L,D=P+L;y===!0?h.push(D,D+1,N):h.push(D+1,D,N),v+=3}c.addGroup(m,v,y===!0?1:2),m+=v}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new Ar(t.radiusTop,t.radiusBottom,t.height,t.radialSegments,t.heightSegments,t.openEnded,t.thetaStart,t.thetaLength)}}class Ba extends Ar{constructor(t=1,e=1,n=32,i=1,r=!1,a=0,o=Math.PI*2){super(0,t,e,n,i,r,a,o),this.type="ConeGeometry",this.parameters={radius:t,height:e,radialSegments:n,heightSegments:i,openEnded:r,thetaStart:a,thetaLength:o}}static fromJSON(t){return new Ba(t.radius,t.height,t.radialSegments,t.heightSegments,t.openEnded,t.thetaStart,t.thetaLength)}}class ts extends Zt{constructor(t=[],e=[],n=1,i=0){super(),this.type="PolyhedronGeometry",this.parameters={vertices:t,indices:e,radius:n,detail:i};const r=[],a=[];o(i),c(n),h(),this.setAttribute("position",new Mt(r,3)),this.setAttribute("normal",new Mt(r.slice(),3)),this.setAttribute("uv",new Mt(a,2)),i===0?this.computeVertexNormals():this.normalizeNormals();function o(x){const M=new I,y=new I,w=new I;for(let b=0;b<e.length;b+=3)d(e[b+0],M),d(e[b+1],y),d(e[b+2],w),l(M,y,w,x)}function l(x,M,y,w){const b=w+1,E=[];for(let v=0;v<=b;v++){E[v]=[];const T=x.clone().lerp(y,v/b),C=M.clone().lerp(y,v/b),P=b-v;for(let L=0;L<=P;L++)L===0&&v===b?E[v][L]=T:E[v][L]=T.clone().lerp(C,L/P)}for(let v=0;v<b;v++)for(let T=0;T<2*(b-v)-1;T++){const C=Math.floor(T/2);T%2===0?(u(E[v][C+1]),u(E[v+1][C]),u(E[v][C])):(u(E[v][C+1]),u(E[v+1][C+1]),u(E[v+1][C]))}}function c(x){const M=new I;for(let y=0;y<r.length;y+=3)M.x=r[y+0],M.y=r[y+1],M.z=r[y+2],M.normalize().multiplyScalar(x),r[y+0]=M.x,r[y+1]=M.y,r[y+2]=M.z}function h(){const x=new I;for(let M=0;M<r.length;M+=3){x.x=r[M+0],x.y=r[M+1],x.z=r[M+2];const y=g(x)/2/Math.PI+.5,w=m(x)/Math.PI+.5;a.push(y,1-w)}p(),f()}function f(){for(let x=0;x<a.length;x+=6){const M=a[x+0],y=a[x+2],w=a[x+4],b=Math.max(M,y,w),E=Math.min(M,y,w);b>.9&&E<.1&&(M<.2&&(a[x+0]+=1),y<.2&&(a[x+2]+=1),w<.2&&(a[x+4]+=1))}}function u(x){r.push(x.x,x.y,x.z)}function d(x,M){const y=x*3;M.x=t[y+0],M.y=t[y+1],M.z=t[y+2]}function p(){const x=new I,M=new I,y=new I,w=new I,b=new it,E=new it,v=new it;for(let T=0,C=0;T<r.length;T+=9,C+=6){x.set(r[T+0],r[T+1],r[T+2]),M.set(r[T+3],r[T+4],r[T+5]),y.set(r[T+6],r[T+7],r[T+8]),b.set(a[C+0],a[C+1]),E.set(a[C+2],a[C+3]),v.set(a[C+4],a[C+5]),w.copy(x).add(M).add(y).divideScalar(3);const P=g(w);_(b,C+0,x,P),_(E,C+2,M,P),_(v,C+4,y,P)}}function _(x,M,y,w){w<0&&x.x===1&&(a[M]=x.x-1),y.x===0&&y.z===0&&(a[M]=w/2/Math.PI+.5)}function g(x){return Math.atan2(x.z,-x.x)}function m(x){return Math.atan2(-x.y,Math.sqrt(x.x*x.x+x.z*x.z))}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new ts(t.vertices,t.indices,t.radius,t.detail)}}class ac extends ts{constructor(t=1,e=0){const n=(1+Math.sqrt(5))/2,i=1/n,r=[-1,-1,-1,-1,-1,1,-1,1,-1,-1,1,1,1,-1,-1,1,-1,1,1,1,-1,1,1,1,0,-i,-n,0,-i,n,0,i,-n,0,i,n,-i,-n,0,-i,n,0,i,-n,0,i,n,0,-n,0,-i,n,0,-i,-n,0,i,n,0,i],a=[3,11,7,3,7,15,3,15,13,7,19,17,7,17,6,7,6,15,17,4,8,17,8,10,17,10,6,8,0,16,8,16,2,8,2,10,0,12,1,0,1,18,0,18,16,6,10,2,6,2,13,6,13,15,2,16,18,2,18,3,2,3,13,18,1,9,18,9,11,18,11,3,4,14,12,4,12,0,4,0,8,11,9,5,11,5,19,11,19,7,19,5,14,19,14,4,19,4,17,1,12,14,1,14,5,1,5,9];super(r,a,t,e),this.type="DodecahedronGeometry",this.parameters={radius:t,detail:e}}static fromJSON(t){return new ac(t.radius,t.detail)}}const vo=new I,Mo=new I,eh=new I,So=new xn;class Bp extends Zt{constructor(t=null,e=1){if(super(),this.type="EdgesGeometry",this.parameters={geometry:t,thresholdAngle:e},t!==null){const i=Math.pow(10,4),r=Math.cos(Ss*e),a=t.getIndex(),o=t.getAttribute("position"),l=a?a.count:o.count,c=[0,0,0],h=["a","b","c"],f=new Array(3),u={},d=[];for(let p=0;p<l;p+=3){a?(c[0]=a.getX(p),c[1]=a.getX(p+1),c[2]=a.getX(p+2)):(c[0]=p,c[1]=p+1,c[2]=p+2);const{a:_,b:g,c:m}=So;if(_.fromBufferAttribute(o,c[0]),g.fromBufferAttribute(o,c[1]),m.fromBufferAttribute(o,c[2]),So.getNormal(eh),f[0]=`${Math.round(_.x*i)},${Math.round(_.y*i)},${Math.round(_.z*i)}`,f[1]=`${Math.round(g.x*i)},${Math.round(g.y*i)},${Math.round(g.z*i)}`,f[2]=`${Math.round(m.x*i)},${Math.round(m.y*i)},${Math.round(m.z*i)}`,!(f[0]===f[1]||f[1]===f[2]||f[2]===f[0]))for(let x=0;x<3;x++){const M=(x+1)%3,y=f[x],w=f[M],b=So[h[x]],E=So[h[M]],v=`${y}_${w}`,T=`${w}_${y}`;T in u&&u[T]?(eh.dot(u[T].normal)<=r&&(d.push(b.x,b.y,b.z),d.push(E.x,E.y,E.z)),u[T]=null):v in u||(u[v]={index0:c[x],index1:c[M],normal:eh.clone()})}}for(const p in u)if(u[p]){const{index0:_,index1:g}=u[p];vo.fromBufferAttribute(o,_),Mo.fromBufferAttribute(o,g),d.push(vo.x,vo.y,vo.z),d.push(Mo.x,Mo.y,Mo.z)}this.setAttribute("position",new Mt(d,3))}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}}class Kn{constructor(){this.type="Curve",this.arcLengthDivisions=200,this.needsUpdate=!1,this.cacheArcLengths=null}getPoint(){pt("Curve: .getPoint() not implemented.")}getPointAt(t,e){const n=this.getUtoTmapping(t);return this.getPoint(n,e)}getPoints(t=5){const e=[];for(let n=0;n<=t;n++)e.push(this.getPoint(n/t));return e}getSpacedPoints(t=5){const e=[];for(let n=0;n<=t;n++)e.push(this.getPointAt(n/t));return e}getLength(){const t=this.getLengths();return t[t.length-1]}getLengths(t=this.arcLengthDivisions){if(this.cacheArcLengths&&this.cacheArcLengths.length===t+1&&!this.needsUpdate)return this.cacheArcLengths;this.needsUpdate=!1;const e=[];let n,i=this.getPoint(0),r=0;e.push(0);for(let a=1;a<=t;a++)n=this.getPoint(a/t),r+=n.distanceTo(i),e.push(r),i=n;return this.cacheArcLengths=e,e}updateArcLengths(){this.needsUpdate=!0,this.getLengths()}getUtoTmapping(t,e=null){const n=this.getLengths();let i=0;const r=n.length;let a;e?a=e:a=t*n[r-1];let o=0,l=r-1,c;for(;o<=l;)if(i=Math.floor(o+(l-o)/2),c=n[i]-a,c<0)o=i+1;else if(c>0)l=i-1;else{l=i;break}if(i=l,n[i]===a)return i/(r-1);const h=n[i],u=n[i+1]-h,d=(a-h)/u;return(i+d)/(r-1)}getTangent(t,e){let i=t-1e-4,r=t+1e-4;i<0&&(i=0),r>1&&(r=1);const a=this.getPoint(i),o=this.getPoint(r),l=e||(a.isVector2?new it:new I);return l.copy(o).sub(a).normalize(),l}getTangentAt(t,e){const n=this.getUtoTmapping(t);return this.getTangent(n,e)}computeFrenetFrames(t,e=!1){const n=new I,i=[],r=[],a=[],o=new I,l=new Yt;for(let d=0;d<=t;d++){const p=d/t;i[d]=this.getTangentAt(p,new I)}r[0]=new I,a[0]=new I;let c=Number.MAX_VALUE;const h=Math.abs(i[0].x),f=Math.abs(i[0].y),u=Math.abs(i[0].z);h<=c&&(c=h,n.set(1,0,0)),f<=c&&(c=f,n.set(0,1,0)),u<=c&&n.set(0,0,1),o.crossVectors(i[0],n).normalize(),r[0].crossVectors(i[0],o),a[0].crossVectors(i[0],r[0]);for(let d=1;d<=t;d++){if(r[d]=r[d-1].clone(),a[d]=a[d-1].clone(),o.crossVectors(i[d-1],i[d]),o.length()>Number.EPSILON){o.normalize();const p=Math.acos(Ht(i[d-1].dot(i[d]),-1,1));r[d].applyMatrix4(l.makeRotationAxis(o,p))}a[d].crossVectors(i[d],r[d])}if(e===!0){let d=Math.acos(Ht(r[0].dot(r[t]),-1,1));d/=t,i[0].dot(o.crossVectors(r[0],r[t]))>0&&(d=-d);for(let p=1;p<=t;p++)r[p].applyMatrix4(l.makeRotationAxis(i[p],d*p)),a[p].crossVectors(i[p],r[p])}return{tangents:i,normals:r,binormals:a}}clone(){return new this.constructor().copy(this)}copy(t){return this.arcLengthDivisions=t.arcLengthDivisions,this}toJSON(){const t={metadata:{version:4.7,type:"Curve",generator:"Curve.toJSON"}};return t.arcLengthDivisions=this.arcLengthDivisions,t.type=this.type,t}fromJSON(t){return this.arcLengthDivisions=t.arcLengthDivisions,this}}class oc extends Kn{constructor(t=0,e=0,n=1,i=1,r=0,a=Math.PI*2,o=!1,l=0){super(),this.isEllipseCurve=!0,this.type="EllipseCurve",this.aX=t,this.aY=e,this.xRadius=n,this.yRadius=i,this.aStartAngle=r,this.aEndAngle=a,this.aClockwise=o,this.aRotation=l}getPoint(t,e=new it){const n=e,i=Math.PI*2;let r=this.aEndAngle-this.aStartAngle;const a=Math.abs(r)<Number.EPSILON;for(;r<0;)r+=i;for(;r>i;)r-=i;r<Number.EPSILON&&(a?r=0:r=i),this.aClockwise===!0&&!a&&(r===i?r=-i:r=r-i);const o=this.aStartAngle+t*r;let l=this.aX+this.xRadius*Math.cos(o),c=this.aY+this.yRadius*Math.sin(o);if(this.aRotation!==0){const h=Math.cos(this.aRotation),f=Math.sin(this.aRotation),u=l-this.aX,d=c-this.aY;l=u*h-d*f+this.aX,c=u*f+d*h+this.aY}return n.set(l,c)}copy(t){return super.copy(t),this.aX=t.aX,this.aY=t.aY,this.xRadius=t.xRadius,this.yRadius=t.yRadius,this.aStartAngle=t.aStartAngle,this.aEndAngle=t.aEndAngle,this.aClockwise=t.aClockwise,this.aRotation=t.aRotation,this}toJSON(){const t=super.toJSON();return t.aX=this.aX,t.aY=this.aY,t.xRadius=this.xRadius,t.yRadius=this.yRadius,t.aStartAngle=this.aStartAngle,t.aEndAngle=this.aEndAngle,t.aClockwise=this.aClockwise,t.aRotation=this.aRotation,t}fromJSON(t){return super.fromJSON(t),this.aX=t.aX,this.aY=t.aY,this.xRadius=t.xRadius,this.yRadius=t.yRadius,this.aStartAngle=t.aStartAngle,this.aEndAngle=t.aEndAngle,this.aClockwise=t.aClockwise,this.aRotation=t.aRotation,this}}class zp extends oc{constructor(t,e,n,i,r,a){super(t,e,n,n,i,r,a),this.isArcCurve=!0,this.type="ArcCurve"}}function pu(){let s=0,t=0,e=0,n=0;function i(r,a,o,l){s=r,t=o,e=-3*r+3*a-2*o-l,n=2*r-2*a+o+l}return{initCatmullRom:function(r,a,o,l,c){i(a,o,c*(o-r),c*(l-a))},initNonuniformCatmullRom:function(r,a,o,l,c,h,f){let u=(a-r)/c-(o-r)/(c+h)+(o-a)/h,d=(o-a)/h-(l-a)/(h+f)+(l-o)/f;u*=h,d*=h,i(a,o,u,d)},calc:function(r){const a=r*r,o=a*r;return s+t*r+e*a+n*o}}}const Od=new I,Bd=new I,nh=new pu,ih=new pu,sh=new pu;class kp extends Kn{constructor(t=[],e=!1,n="centripetal",i=.5){super(),this.isCatmullRomCurve3=!0,this.type="CatmullRomCurve3",this.points=t,this.closed=e,this.curveType=n,this.tension=i}getPoint(t,e=new I){const n=e,i=this.points,r=i.length,a=(r-(this.closed?0:1))*t;let o=Math.floor(a),l=a-o;this.closed?o+=o>0?0:(Math.floor(Math.abs(o)/r)+1)*r:l===0&&o===r-1&&(o=r-2,l=1);let c,h;this.closed||o>0?c=i[(o-1)%r]:(Bd.subVectors(i[0],i[1]).add(i[0]),c=Bd);const f=i[o%r],u=i[(o+1)%r];if(this.closed||o+2<r?h=i[(o+2)%r]:(Od.subVectors(i[r-1],i[r-2]).add(i[r-1]),h=Od),this.curveType==="centripetal"||this.curveType==="chordal"){const d=this.curveType==="chordal"?.5:.25;let p=Math.pow(c.distanceToSquared(f),d),_=Math.pow(f.distanceToSquared(u),d),g=Math.pow(u.distanceToSquared(h),d);_<1e-4&&(_=1),p<1e-4&&(p=_),g<1e-4&&(g=_),nh.initNonuniformCatmullRom(c.x,f.x,u.x,h.x,p,_,g),ih.initNonuniformCatmullRom(c.y,f.y,u.y,h.y,p,_,g),sh.initNonuniformCatmullRom(c.z,f.z,u.z,h.z,p,_,g)}else this.curveType==="catmullrom"&&(nh.initCatmullRom(c.x,f.x,u.x,h.x,this.tension),ih.initCatmullRom(c.y,f.y,u.y,h.y,this.tension),sh.initCatmullRom(c.z,f.z,u.z,h.z,this.tension));return n.set(nh.calc(l),ih.calc(l),sh.calc(l)),n}copy(t){super.copy(t),this.points=[];for(let e=0,n=t.points.length;e<n;e++){const i=t.points[e];this.points.push(i.clone())}return this.closed=t.closed,this.curveType=t.curveType,this.tension=t.tension,this}toJSON(){const t=super.toJSON();t.points=[];for(let e=0,n=this.points.length;e<n;e++){const i=this.points[e];t.points.push(i.toArray())}return t.closed=this.closed,t.curveType=this.curveType,t.tension=this.tension,t}fromJSON(t){super.fromJSON(t),this.points=[];for(let e=0,n=t.points.length;e<n;e++){const i=t.points[e];this.points.push(new I().fromArray(i))}return this.closed=t.closed,this.curveType=t.curveType,this.tension=t.tension,this}}function zd(s,t,e,n,i){const r=(n-t)*.5,a=(i-e)*.5,o=s*s,l=s*o;return(2*e-2*n+r+a)*l+(-3*e+3*n-2*r-a)*o+r*s+e}function b_(s,t){const e=1-s;return e*e*t}function w_(s,t){return 2*(1-s)*s*t}function A_(s,t){return s*s*t}function ha(s,t,e,n){return b_(s,t)+w_(s,e)+A_(s,n)}function T_(s,t){const e=1-s;return e*e*e*t}function E_(s,t){const e=1-s;return 3*e*e*s*t}function C_(s,t){return 3*(1-s)*s*s*t}function R_(s,t){return s*s*s*t}function ua(s,t,e,n,i){return T_(s,t)+E_(s,e)+C_(s,n)+R_(s,i)}class mu extends Kn{constructor(t=new it,e=new it,n=new it,i=new it){super(),this.isCubicBezierCurve=!0,this.type="CubicBezierCurve",this.v0=t,this.v1=e,this.v2=n,this.v3=i}getPoint(t,e=new it){const n=e,i=this.v0,r=this.v1,a=this.v2,o=this.v3;return n.set(ua(t,i.x,r.x,a.x,o.x),ua(t,i.y,r.y,a.y,o.y)),n}copy(t){return super.copy(t),this.v0.copy(t.v0),this.v1.copy(t.v1),this.v2.copy(t.v2),this.v3.copy(t.v3),this}toJSON(){const t=super.toJSON();return t.v0=this.v0.toArray(),t.v1=this.v1.toArray(),t.v2=this.v2.toArray(),t.v3=this.v3.toArray(),t}fromJSON(t){return super.fromJSON(t),this.v0.fromArray(t.v0),this.v1.fromArray(t.v1),this.v2.fromArray(t.v2),this.v3.fromArray(t.v3),this}}class Vp extends Kn{constructor(t=new I,e=new I,n=new I,i=new I){super(),this.isCubicBezierCurve3=!0,this.type="CubicBezierCurve3",this.v0=t,this.v1=e,this.v2=n,this.v3=i}getPoint(t,e=new I){const n=e,i=this.v0,r=this.v1,a=this.v2,o=this.v3;return n.set(ua(t,i.x,r.x,a.x,o.x),ua(t,i.y,r.y,a.y,o.y),ua(t,i.z,r.z,a.z,o.z)),n}copy(t){return super.copy(t),this.v0.copy(t.v0),this.v1.copy(t.v1),this.v2.copy(t.v2),this.v3.copy(t.v3),this}toJSON(){const t=super.toJSON();return t.v0=this.v0.toArray(),t.v1=this.v1.toArray(),t.v2=this.v2.toArray(),t.v3=this.v3.toArray(),t}fromJSON(t){return super.fromJSON(t),this.v0.fromArray(t.v0),this.v1.fromArray(t.v1),this.v2.fromArray(t.v2),this.v3.fromArray(t.v3),this}}class gu extends Kn{constructor(t=new it,e=new it){super(),this.isLineCurve=!0,this.type="LineCurve",this.v1=t,this.v2=e}getPoint(t,e=new it){const n=e;return t===1?n.copy(this.v2):(n.copy(this.v2).sub(this.v1),n.multiplyScalar(t).add(this.v1)),n}getPointAt(t,e){return this.getPoint(t,e)}getTangent(t,e=new it){return e.subVectors(this.v2,this.v1).normalize()}getTangentAt(t,e){return this.getTangent(t,e)}copy(t){return super.copy(t),this.v1.copy(t.v1),this.v2.copy(t.v2),this}toJSON(){const t=super.toJSON();return t.v1=this.v1.toArray(),t.v2=this.v2.toArray(),t}fromJSON(t){return super.fromJSON(t),this.v1.fromArray(t.v1),this.v2.fromArray(t.v2),this}}class Gp extends Kn{constructor(t=new I,e=new I){super(),this.isLineCurve3=!0,this.type="LineCurve3",this.v1=t,this.v2=e}getPoint(t,e=new I){const n=e;return t===1?n.copy(this.v2):(n.copy(this.v2).sub(this.v1),n.multiplyScalar(t).add(this.v1)),n}getPointAt(t,e){return this.getPoint(t,e)}getTangent(t,e=new I){return e.subVectors(this.v2,this.v1).normalize()}getTangentAt(t,e){return this.getTangent(t,e)}copy(t){return super.copy(t),this.v1.copy(t.v1),this.v2.copy(t.v2),this}toJSON(){const t=super.toJSON();return t.v1=this.v1.toArray(),t.v2=this.v2.toArray(),t}fromJSON(t){return super.fromJSON(t),this.v1.fromArray(t.v1),this.v2.fromArray(t.v2),this}}class _u extends Kn{constructor(t=new it,e=new it,n=new it){super(),this.isQuadraticBezierCurve=!0,this.type="QuadraticBezierCurve",this.v0=t,this.v1=e,this.v2=n}getPoint(t,e=new it){const n=e,i=this.v0,r=this.v1,a=this.v2;return n.set(ha(t,i.x,r.x,a.x),ha(t,i.y,r.y,a.y)),n}copy(t){return super.copy(t),this.v0.copy(t.v0),this.v1.copy(t.v1),this.v2.copy(t.v2),this}toJSON(){const t=super.toJSON();return t.v0=this.v0.toArray(),t.v1=this.v1.toArray(),t.v2=this.v2.toArray(),t}fromJSON(t){return super.fromJSON(t),this.v0.fromArray(t.v0),this.v1.fromArray(t.v1),this.v2.fromArray(t.v2),this}}class xu extends Kn{constructor(t=new I,e=new I,n=new I){super(),this.isQuadraticBezierCurve3=!0,this.type="QuadraticBezierCurve3",this.v0=t,this.v1=e,this.v2=n}getPoint(t,e=new I){const n=e,i=this.v0,r=this.v1,a=this.v2;return n.set(ha(t,i.x,r.x,a.x),ha(t,i.y,r.y,a.y),ha(t,i.z,r.z,a.z)),n}copy(t){return super.copy(t),this.v0.copy(t.v0),this.v1.copy(t.v1),this.v2.copy(t.v2),this}toJSON(){const t=super.toJSON();return t.v0=this.v0.toArray(),t.v1=this.v1.toArray(),t.v2=this.v2.toArray(),t}fromJSON(t){return super.fromJSON(t),this.v0.fromArray(t.v0),this.v1.fromArray(t.v1),this.v2.fromArray(t.v2),this}}class yu extends Kn{constructor(t=[]){super(),this.isSplineCurve=!0,this.type="SplineCurve",this.points=t}getPoint(t,e=new it){const n=e,i=this.points,r=(i.length-1)*t,a=Math.floor(r),o=r-a,l=i[a===0?a:a-1],c=i[a],h=i[a>i.length-2?i.length-1:a+1],f=i[a>i.length-3?i.length-1:a+2];return n.set(zd(o,l.x,c.x,h.x,f.x),zd(o,l.y,c.y,h.y,f.y)),n}copy(t){super.copy(t),this.points=[];for(let e=0,n=t.points.length;e<n;e++){const i=t.points[e];this.points.push(i.clone())}return this}toJSON(){const t=super.toJSON();t.points=[];for(let e=0,n=this.points.length;e<n;e++){const i=this.points[e];t.points.push(i.toArray())}return t}fromJSON(t){super.fromJSON(t),this.points=[];for(let e=0,n=t.points.length;e<n;e++){const i=t.points[e];this.points.push(new it().fromArray(i))}return this}}var Pl=Object.freeze({__proto__:null,ArcCurve:zp,CatmullRomCurve3:kp,CubicBezierCurve:mu,CubicBezierCurve3:Vp,EllipseCurve:oc,LineCurve:gu,LineCurve3:Gp,QuadraticBezierCurve:_u,QuadraticBezierCurve3:xu,SplineCurve:yu});class Hp extends Kn{constructor(){super(),this.type="CurvePath",this.curves=[],this.autoClose=!1}add(t){this.curves.push(t)}closePath(){const t=this.curves[0].getPoint(0),e=this.curves[this.curves.length-1].getPoint(1);if(!t.equals(e)){const n=t.isVector2===!0?"LineCurve":"LineCurve3";this.curves.push(new Pl[n](e,t))}return this}getPoint(t,e){const n=t*this.getLength(),i=this.getCurveLengths();let r=0;for(;r<i.length;){if(i[r]>=n){const a=i[r]-n,o=this.curves[r],l=o.getLength(),c=l===0?0:1-a/l;return o.getPointAt(c,e)}r++}return null}getLength(){const t=this.getCurveLengths();return t[t.length-1]}updateArcLengths(){this.needsUpdate=!0,this.cacheLengths=null,this.getCurveLengths()}getCurveLengths(){if(this.cacheLengths&&this.cacheLengths.length===this.curves.length)return this.cacheLengths;const t=[];let e=0;for(let n=0,i=this.curves.length;n<i;n++)e+=this.curves[n].getLength(),t.push(e);return this.cacheLengths=t,t}getSpacedPoints(t=40){const e=[];for(let n=0;n<=t;n++)e.push(this.getPoint(n/t));return this.autoClose&&e.push(e[0]),e}getPoints(t=12){const e=[];let n;for(let i=0,r=this.curves;i<r.length;i++){const a=r[i],o=a.isEllipseCurve?t*2:a.isLineCurve||a.isLineCurve3?1:a.isSplineCurve?t*a.points.length:t,l=a.getPoints(o);for(let c=0;c<l.length;c++){const h=l[c];n&&n.equals(h)||(e.push(h),n=h)}}return this.autoClose&&e.length>1&&!e[e.length-1].equals(e[0])&&e.push(e[0]),e}copy(t){super.copy(t),this.curves=[];for(let e=0,n=t.curves.length;e<n;e++){const i=t.curves[e];this.curves.push(i.clone())}return this.autoClose=t.autoClose,this}toJSON(){const t=super.toJSON();t.autoClose=this.autoClose,t.curves=[];for(let e=0,n=this.curves.length;e<n;e++){const i=this.curves[e];t.curves.push(i.toJSON())}return t}fromJSON(t){super.fromJSON(t),this.autoClose=t.autoClose,this.curves=[];for(let e=0,n=t.curves.length;e<n;e++){const i=t.curves[e];this.curves.push(new Pl[i.type]().fromJSON(i))}return this}}class wa extends Hp{constructor(t){super(),this.type="Path",this.currentPoint=new it,t&&this.setFromPoints(t)}setFromPoints(t){this.moveTo(t[0].x,t[0].y);for(let e=1,n=t.length;e<n;e++)this.lineTo(t[e].x,t[e].y);return this}moveTo(t,e){return this.currentPoint.set(t,e),this}lineTo(t,e){const n=new gu(this.currentPoint.clone(),new it(t,e));return this.curves.push(n),this.currentPoint.set(t,e),this}quadraticCurveTo(t,e,n,i){const r=new _u(this.currentPoint.clone(),new it(t,e),new it(n,i));return this.curves.push(r),this.currentPoint.set(n,i),this}bezierCurveTo(t,e,n,i,r,a){const o=new mu(this.currentPoint.clone(),new it(t,e),new it(n,i),new it(r,a));return this.curves.push(o),this.currentPoint.set(r,a),this}splineThru(t){const e=[this.currentPoint.clone()].concat(t),n=new yu(e);return this.curves.push(n),this.currentPoint.copy(t[t.length-1]),this}arc(t,e,n,i,r,a){const o=this.currentPoint.x,l=this.currentPoint.y;return this.absarc(t+o,e+l,n,i,r,a),this}absarc(t,e,n,i,r,a){return this.absellipse(t,e,n,n,i,r,a),this}ellipse(t,e,n,i,r,a,o,l){const c=this.currentPoint.x,h=this.currentPoint.y;return this.absellipse(t+c,e+h,n,i,r,a,o,l),this}absellipse(t,e,n,i,r,a,o,l){const c=new oc(t,e,n,i,r,a,o,l);if(this.curves.length>0){const f=c.getPoint(0);f.equals(this.currentPoint)||this.lineTo(f.x,f.y)}this.curves.push(c);const h=c.getPoint(1);return this.currentPoint.copy(h),this}copy(t){return super.copy(t),this.currentPoint.copy(t.currentPoint),this}toJSON(){const t=super.toJSON();return t.currentPoint=this.currentPoint.toArray(),t}fromJSON(t){return super.fromJSON(t),this.currentPoint.fromArray(t.currentPoint),this}}class za extends wa{constructor(t){super(t),this.uuid=Cn(),this.type="Shape",this.holes=[]}getPointsHoles(t){const e=[];for(let n=0,i=this.holes.length;n<i;n++)e[n]=this.holes[n].getPoints(t);return e}extractPoints(t){return{shape:this.getPoints(t),holes:this.getPointsHoles(t)}}copy(t){super.copy(t),this.holes=[];for(let e=0,n=t.holes.length;e<n;e++){const i=t.holes[e];this.holes.push(i.clone())}return this}toJSON(){const t=super.toJSON();t.uuid=this.uuid,t.holes=[];for(let e=0,n=this.holes.length;e<n;e++){const i=this.holes[e];t.holes.push(i.toJSON())}return t}fromJSON(t){super.fromJSON(t),this.uuid=t.uuid,this.holes=[];for(let e=0,n=t.holes.length;e<n;e++){const i=t.holes[e];this.holes.push(new wa().fromJSON(i))}return this}}function I_(s,t,e=2){const n=t&&t.length,i=n?t[0]*e:s.length;let r=Wp(s,0,i,e,!0);const a=[];if(!r||r.next===r.prev)return a;let o,l,c;if(n&&(r=U_(s,t,r,e)),s.length>80*e){o=s[0],l=s[1];let h=o,f=l;for(let u=e;u<i;u+=e){const d=s[u],p=s[u+1];d<o&&(o=d),p<l&&(l=p),d>h&&(h=d),p>f&&(f=p)}c=Math.max(h-o,f-l),c=c!==0?32767/c:0}return Aa(r,a,e,o,l,c,0),a}function Wp(s,t,e,n,i){let r;if(i===q_(s,t,e,n)>0)for(let a=t;a<e;a+=n)r=kd(a/n|0,s[a],s[a+1],r);else for(let a=e-n;a>=t;a-=n)r=kd(a/n|0,s[a],s[a+1],r);return r&&yr(r,r.next)&&(Ea(r),r=r.next),r}function Cs(s,t){if(!s)return s;t||(t=s);let e=s,n;do if(n=!1,!e.steiner&&(yr(e,e.next)||Ee(e.prev,e,e.next)===0)){if(Ea(e),e=t=e.prev,e===e.next)break;n=!0}else e=e.next;while(n||e!==t);return t}function Aa(s,t,e,n,i,r,a){if(!s)return;!a&&r&&k_(s,n,i,r);let o=s;for(;s.prev!==s.next;){const l=s.prev,c=s.next;if(r?L_(s,n,i,r):P_(s)){t.push(l.i,s.i,c.i),Ea(s),s=c.next,o=c.next;continue}if(s=c,s===o){a?a===1?(s=D_(Cs(s),t),Aa(s,t,e,n,i,r,2)):a===2&&N_(s,t,e,n,i,r):Aa(Cs(s),t,e,n,i,r,1);break}}}function P_(s){const t=s.prev,e=s,n=s.next;if(Ee(t,e,n)>=0)return!1;const i=t.x,r=e.x,a=n.x,o=t.y,l=e.y,c=n.y,h=Math.min(i,r,a),f=Math.min(o,l,c),u=Math.max(i,r,a),d=Math.max(o,l,c);let p=n.next;for(;p!==t;){if(p.x>=h&&p.x<=u&&p.y>=f&&p.y<=d&&Jr(i,o,r,l,a,c,p.x,p.y)&&Ee(p.prev,p,p.next)>=0)return!1;p=p.next}return!0}function L_(s,t,e,n){const i=s.prev,r=s,a=s.next;if(Ee(i,r,a)>=0)return!1;const o=i.x,l=r.x,c=a.x,h=i.y,f=r.y,u=a.y,d=Math.min(o,l,c),p=Math.min(h,f,u),_=Math.max(o,l,c),g=Math.max(h,f,u),m=Eh(d,p,t,e,n),x=Eh(_,g,t,e,n);let M=s.prevZ,y=s.nextZ;for(;M&&M.z>=m&&y&&y.z<=x;){if(M.x>=d&&M.x<=_&&M.y>=p&&M.y<=g&&M!==i&&M!==a&&Jr(o,h,l,f,c,u,M.x,M.y)&&Ee(M.prev,M,M.next)>=0||(M=M.prevZ,y.x>=d&&y.x<=_&&y.y>=p&&y.y<=g&&y!==i&&y!==a&&Jr(o,h,l,f,c,u,y.x,y.y)&&Ee(y.prev,y,y.next)>=0))return!1;y=y.nextZ}for(;M&&M.z>=m;){if(M.x>=d&&M.x<=_&&M.y>=p&&M.y<=g&&M!==i&&M!==a&&Jr(o,h,l,f,c,u,M.x,M.y)&&Ee(M.prev,M,M.next)>=0)return!1;M=M.prevZ}for(;y&&y.z<=x;){if(y.x>=d&&y.x<=_&&y.y>=p&&y.y<=g&&y!==i&&y!==a&&Jr(o,h,l,f,c,u,y.x,y.y)&&Ee(y.prev,y,y.next)>=0)return!1;y=y.nextZ}return!0}function D_(s,t){let e=s;do{const n=e.prev,i=e.next.next;!yr(n,i)&&qp(n,e,e.next,i)&&Ta(n,i)&&Ta(i,n)&&(t.push(n.i,e.i,i.i),Ea(e),Ea(e.next),e=s=i),e=e.next}while(e!==s);return Cs(e)}function N_(s,t,e,n,i,r){let a=s;do{let o=a.next.next;for(;o!==a.prev;){if(a.i!==o.i&&H_(a,o)){let l=Yp(a,o);a=Cs(a,a.next),l=Cs(l,l.next),Aa(a,t,e,n,i,r,0),Aa(l,t,e,n,i,r,0);return}o=o.next}a=a.next}while(a!==s)}function U_(s,t,e,n){const i=[];for(let r=0,a=t.length;r<a;r++){const o=t[r]*n,l=r<a-1?t[r+1]*n:s.length,c=Wp(s,o,l,n,!1);c===c.next&&(c.steiner=!0),i.push(G_(c))}i.sort(F_);for(let r=0;r<i.length;r++)e=O_(i[r],e);return e}function F_(s,t){let e=s.x-t.x;if(e===0&&(e=s.y-t.y,e===0)){const n=(s.next.y-s.y)/(s.next.x-s.x),i=(t.next.y-t.y)/(t.next.x-t.x);e=n-i}return e}function O_(s,t){const e=B_(s,t);if(!e)return t;const n=Yp(e,s);return Cs(n,n.next),Cs(e,e.next)}function B_(s,t){let e=t;const n=s.x,i=s.y;let r=-1/0,a;if(yr(s,e))return e;do{if(yr(s,e.next))return e.next;if(i<=e.y&&i>=e.next.y&&e.next.y!==e.y){const f=e.x+(i-e.y)*(e.next.x-e.x)/(e.next.y-e.y);if(f<=n&&f>r&&(r=f,a=e.x<e.next.x?e:e.next,f===n))return a}e=e.next}while(e!==t);if(!a)return null;const o=a,l=a.x,c=a.y;let h=1/0;e=a;do{if(n>=e.x&&e.x>=l&&n!==e.x&&Xp(i<c?n:r,i,l,c,i<c?r:n,i,e.x,e.y)){const f=Math.abs(i-e.y)/(n-e.x);Ta(e,s)&&(f<h||f===h&&(e.x>a.x||e.x===a.x&&z_(a,e)))&&(a=e,h=f)}e=e.next}while(e!==o);return a}function z_(s,t){return Ee(s.prev,s,t.prev)<0&&Ee(t.next,s,s.next)<0}function k_(s,t,e,n){let i=s;do i.z===0&&(i.z=Eh(i.x,i.y,t,e,n)),i.prevZ=i.prev,i.nextZ=i.next,i=i.next;while(i!==s);i.prevZ.nextZ=null,i.prevZ=null,V_(i)}function V_(s){let t,e=1;do{let n=s,i;s=null;let r=null;for(t=0;n;){t++;let a=n,o=0;for(let c=0;c<e&&(o++,a=a.nextZ,!!a);c++);let l=e;for(;o>0||l>0&&a;)o!==0&&(l===0||!a||n.z<=a.z)?(i=n,n=n.nextZ,o--):(i=a,a=a.nextZ,l--),r?r.nextZ=i:s=i,i.prevZ=r,r=i;n=a}r.nextZ=null,e*=2}while(t>1);return s}function Eh(s,t,e,n,i){return s=(s-e)*i|0,t=(t-n)*i|0,s=(s|s<<8)&16711935,s=(s|s<<4)&252645135,s=(s|s<<2)&858993459,s=(s|s<<1)&1431655765,t=(t|t<<8)&16711935,t=(t|t<<4)&252645135,t=(t|t<<2)&858993459,t=(t|t<<1)&1431655765,s|t<<1}function G_(s){let t=s,e=s;do(t.x<e.x||t.x===e.x&&t.y<e.y)&&(e=t),t=t.next;while(t!==s);return e}function Xp(s,t,e,n,i,r,a,o){return(i-a)*(t-o)>=(s-a)*(r-o)&&(s-a)*(n-o)>=(e-a)*(t-o)&&(e-a)*(r-o)>=(i-a)*(n-o)}function Jr(s,t,e,n,i,r,a,o){return!(s===a&&t===o)&&Xp(s,t,e,n,i,r,a,o)}function H_(s,t){return s.next.i!==t.i&&s.prev.i!==t.i&&!W_(s,t)&&(Ta(s,t)&&Ta(t,s)&&X_(s,t)&&(Ee(s.prev,s,t.prev)||Ee(s,t.prev,t))||yr(s,t)&&Ee(s.prev,s,s.next)>0&&Ee(t.prev,t,t.next)>0)}function Ee(s,t,e){return(t.y-s.y)*(e.x-t.x)-(t.x-s.x)*(e.y-t.y)}function yr(s,t){return s.x===t.x&&s.y===t.y}function qp(s,t,e,n){const i=wo(Ee(s,t,e)),r=wo(Ee(s,t,n)),a=wo(Ee(e,n,s)),o=wo(Ee(e,n,t));return!!(i!==r&&a!==o||i===0&&bo(s,e,t)||r===0&&bo(s,n,t)||a===0&&bo(e,s,n)||o===0&&bo(e,t,n))}function bo(s,t,e){return t.x<=Math.max(s.x,e.x)&&t.x>=Math.min(s.x,e.x)&&t.y<=Math.max(s.y,e.y)&&t.y>=Math.min(s.y,e.y)}function wo(s){return s>0?1:s<0?-1:0}function W_(s,t){let e=s;do{if(e.i!==s.i&&e.next.i!==s.i&&e.i!==t.i&&e.next.i!==t.i&&qp(e,e.next,s,t))return!0;e=e.next}while(e!==s);return!1}function Ta(s,t){return Ee(s.prev,s,s.next)<0?Ee(s,t,s.next)>=0&&Ee(s,s.prev,t)>=0:Ee(s,t,s.prev)<0||Ee(s,s.next,t)<0}function X_(s,t){let e=s,n=!1;const i=(s.x+t.x)/2,r=(s.y+t.y)/2;do e.y>r!=e.next.y>r&&e.next.y!==e.y&&i<(e.next.x-e.x)*(r-e.y)/(e.next.y-e.y)+e.x&&(n=!n),e=e.next;while(e!==s);return n}function Yp(s,t){const e=Ch(s.i,s.x,s.y),n=Ch(t.i,t.x,t.y),i=s.next,r=t.prev;return s.next=t,t.prev=s,e.next=i,i.prev=e,n.next=e,e.prev=n,r.next=n,n.prev=r,n}function kd(s,t,e,n){const i=Ch(s,t,e);return n?(i.next=n.next,i.prev=n,n.next.prev=i,n.next=i):(i.prev=i,i.next=i),i}function Ea(s){s.next.prev=s.prev,s.prev.next=s.next,s.prevZ&&(s.prevZ.nextZ=s.nextZ),s.nextZ&&(s.nextZ.prevZ=s.prevZ)}function Ch(s,t,e){return{i:s,x:t,y:e,prev:null,next:null,z:0,prevZ:null,nextZ:null,steiner:!1}}function q_(s,t,e,n){let i=0;for(let r=t,a=e-n;r<e;r+=n)i+=(s[a]-s[r])*(s[r+1]+s[a+1]),a=r;return i}class Y_{static triangulate(t,e,n=2){return I_(t,e,n)}}class qn{static area(t){const e=t.length;let n=0;for(let i=e-1,r=0;r<e;i=r++)n+=t[i].x*t[r].y-t[r].x*t[i].y;return n*.5}static isClockWise(t){return qn.area(t)<0}static triangulateShape(t,e){const n=[],i=[],r=[];Vd(t),Gd(n,t);let a=t.length;e.forEach(Vd);for(let l=0;l<e.length;l++)i.push(a),a+=e[l].length,Gd(n,e[l]);const o=Y_.triangulate(n,i);for(let l=0;l<o.length;l+=3)r.push(o.slice(l,l+3));return r}}function Vd(s){const t=s.length;t>2&&s[t-1].equals(s[0])&&s.pop()}function Gd(s,t){for(let e=0;e<t.length;e++)s.push(t[e].x),s.push(t[e].y)}class lc extends Zt{constructor(t=new za([new it(.5,.5),new it(-.5,.5),new it(-.5,-.5),new it(.5,-.5)]),e={}){super(),this.type="ExtrudeGeometry",this.parameters={shapes:t,options:e},t=Array.isArray(t)?t:[t];const n=this,i=[],r=[];for(let o=0,l=t.length;o<l;o++){const c=t[o];a(c)}this.setAttribute("position",new Mt(i,3)),this.setAttribute("uv",new Mt(r,2)),this.computeVertexNormals();function a(o){const l=[],c=e.curveSegments!==void 0?e.curveSegments:12,h=e.steps!==void 0?e.steps:1,f=e.depth!==void 0?e.depth:1;let u=e.bevelEnabled!==void 0?e.bevelEnabled:!0,d=e.bevelThickness!==void 0?e.bevelThickness:.2,p=e.bevelSize!==void 0?e.bevelSize:d-.1,_=e.bevelOffset!==void 0?e.bevelOffset:0,g=e.bevelSegments!==void 0?e.bevelSegments:3;const m=e.extrudePath,x=e.UVGenerator!==void 0?e.UVGenerator:Z_;let M,y=!1,w,b,E,v;if(m){M=m.getSpacedPoints(h),y=!0,u=!1;const nt=m.isCatmullRomCurve3?m.closed:!1;w=m.computeFrenetFrames(h,nt),b=new I,E=new I,v=new I}u||(g=0,d=0,p=0,_=0);const T=o.extractPoints(c);let C=T.shape;const P=T.holes;if(!qn.isClockWise(C)){C=C.reverse();for(let nt=0,rt=P.length;nt<rt;nt++){const at=P[nt];qn.isClockWise(at)&&(P[nt]=at.reverse())}}function N(nt){const at=10000000000000001e-36;let ot=nt[0];for(let dt=1;dt<=nt.length;dt++){const Vt=dt%nt.length,Bt=nt[Vt],qt=Bt.x-ot.x,Kt=Bt.y-ot.y,U=qt*qt+Kt*Kt,de=Math.max(Math.abs(Bt.x),Math.abs(Bt.y),Math.abs(ot.x),Math.abs(ot.y)),ie=at*de*de;if(U<=ie){nt.splice(Vt,1),dt--;continue}ot=Bt}}N(C),P.forEach(N);const D=P.length,O=C;for(let nt=0;nt<D;nt++){const rt=P[nt];C=C.concat(rt)}function V(nt,rt,at){return rt||Nt("ExtrudeGeometry: vec does not exist"),nt.clone().addScaledVector(rt,at)}const z=C.length;function G(nt,rt,at){let ot,dt,Vt;const Bt=nt.x-rt.x,qt=nt.y-rt.y,Kt=at.x-nt.x,U=at.y-nt.y,de=Bt*Bt+qt*qt,ie=Bt*U-qt*Kt;if(Math.abs(ie)>Number.EPSILON){const R=Math.sqrt(de),S=Math.sqrt(Kt*Kt+U*U),k=rt.x-qt/R,q=rt.y+Bt/R,J=at.x-U/S,lt=at.y+Kt/S,ht=((J-k)*U-(lt-q)*Kt)/(Bt*U-qt*Kt);ot=k+Bt*ht-nt.x,dt=q+qt*ht-nt.y;const Q=ot*ot+dt*dt;if(Q<=2)return new it(ot,dt);Vt=Math.sqrt(Q/2)}else{let R=!1;Bt>Number.EPSILON?Kt>Number.EPSILON&&(R=!0):Bt<-Number.EPSILON?Kt<-Number.EPSILON&&(R=!0):Math.sign(qt)===Math.sign(U)&&(R=!0),R?(ot=-qt,dt=Bt,Vt=Math.sqrt(de)):(ot=Bt,dt=qt,Vt=Math.sqrt(de/2))}return new it(ot/Vt,dt/Vt)}const X=[];for(let nt=0,rt=O.length,at=rt-1,ot=nt+1;nt<rt;nt++,at++,ot++)at===rt&&(at=0),ot===rt&&(ot=0),X[nt]=G(O[nt],O[at],O[ot]);const $=[];let Z,ct=X.concat();for(let nt=0,rt=D;nt<rt;nt++){const at=P[nt];Z=[];for(let ot=0,dt=at.length,Vt=dt-1,Bt=ot+1;ot<dt;ot++,Vt++,Bt++)Vt===dt&&(Vt=0),Bt===dt&&(Bt=0),Z[ot]=G(at[ot],at[Vt],at[Bt]);$.push(Z),ct=ct.concat(Z)}let bt;if(g===0)bt=qn.triangulateShape(O,P);else{const nt=[],rt=[];for(let at=0;at<g;at++){const ot=at/g,dt=d*Math.cos(ot*Math.PI/2),Vt=p*Math.sin(ot*Math.PI/2)+_;for(let Bt=0,qt=O.length;Bt<qt;Bt++){const Kt=V(O[Bt],X[Bt],Vt);ft(Kt.x,Kt.y,-dt),ot===0&&nt.push(Kt)}for(let Bt=0,qt=D;Bt<qt;Bt++){const Kt=P[Bt];Z=$[Bt];const U=[];for(let de=0,ie=Kt.length;de<ie;de++){const R=V(Kt[de],Z[de],Vt);ft(R.x,R.y,-dt),ot===0&&U.push(R)}ot===0&&rt.push(U)}}bt=qn.triangulateShape(nt,rt)}const $t=bt.length,Wt=p+_;for(let nt=0;nt<z;nt++){const rt=u?V(C[nt],ct[nt],Wt):C[nt];y?(E.copy(w.normals[0]).multiplyScalar(rt.x),b.copy(w.binormals[0]).multiplyScalar(rt.y),v.copy(M[0]).add(E).add(b),ft(v.x,v.y,v.z)):ft(rt.x,rt.y,0)}for(let nt=1;nt<=h;nt++)for(let rt=0;rt<z;rt++){const at=u?V(C[rt],ct[rt],Wt):C[rt];y?(E.copy(w.normals[nt]).multiplyScalar(at.x),b.copy(w.binormals[nt]).multiplyScalar(at.y),v.copy(M[nt]).add(E).add(b),ft(v.x,v.y,v.z)):ft(at.x,at.y,f/h*nt)}for(let nt=g-1;nt>=0;nt--){const rt=nt/g,at=d*Math.cos(rt*Math.PI/2),ot=p*Math.sin(rt*Math.PI/2)+_;for(let dt=0,Vt=O.length;dt<Vt;dt++){const Bt=V(O[dt],X[dt],ot);ft(Bt.x,Bt.y,f+at)}for(let dt=0,Vt=P.length;dt<Vt;dt++){const Bt=P[dt];Z=$[dt];for(let qt=0,Kt=Bt.length;qt<Kt;qt++){const U=V(Bt[qt],Z[qt],ot);y?ft(U.x,U.y+M[h-1].y,M[h-1].x+at):ft(U.x,U.y,f+at)}}}Qt(),K();function Qt(){const nt=i.length/3;if(u){let rt=0,at=z*rt;for(let ot=0;ot<$t;ot++){const dt=bt[ot];kt(dt[2]+at,dt[1]+at,dt[0]+at)}rt=h+g*2,at=z*rt;for(let ot=0;ot<$t;ot++){const dt=bt[ot];kt(dt[0]+at,dt[1]+at,dt[2]+at)}}else{for(let rt=0;rt<$t;rt++){const at=bt[rt];kt(at[2],at[1],at[0])}for(let rt=0;rt<$t;rt++){const at=bt[rt];kt(at[0]+z*h,at[1]+z*h,at[2]+z*h)}}n.addGroup(nt,i.length/3-nt,0)}function K(){const nt=i.length/3;let rt=0;tt(O,rt),rt+=O.length;for(let at=0,ot=P.length;at<ot;at++){const dt=P[at];tt(dt,rt),rt+=dt.length}n.addGroup(nt,i.length/3-nt,1)}function tt(nt,rt){let at=nt.length;for(;--at>=0;){const ot=at;let dt=at-1;dt<0&&(dt=nt.length-1);for(let Vt=0,Bt=h+g*2;Vt<Bt;Vt++){const qt=z*Vt,Kt=z*(Vt+1),U=rt+ot+qt,de=rt+dt+qt,ie=rt+dt+Kt,R=rt+ot+Kt;Tt(U,de,ie,R)}}}function ft(nt,rt,at){l.push(nt),l.push(rt),l.push(at)}function kt(nt,rt,at){Xt(nt),Xt(rt),Xt(at);const ot=i.length/3,dt=x.generateTopUV(n,i,ot-3,ot-2,ot-1);ge(dt[0]),ge(dt[1]),ge(dt[2])}function Tt(nt,rt,at,ot){Xt(nt),Xt(rt),Xt(ot),Xt(rt),Xt(at),Xt(ot);const dt=i.length/3,Vt=x.generateSideWallUV(n,i,dt-6,dt-3,dt-2,dt-1);ge(Vt[0]),ge(Vt[1]),ge(Vt[3]),ge(Vt[1]),ge(Vt[2]),ge(Vt[3])}function Xt(nt){i.push(l[nt*3+0]),i.push(l[nt*3+1]),i.push(l[nt*3+2])}function ge(nt){r.push(nt.x),r.push(nt.y)}}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}toJSON(){const t=super.toJSON(),e=this.parameters.shapes,n=this.parameters.options;return $_(e,n,t)}static fromJSON(t,e){const n=[];for(let r=0,a=t.shapes.length;r<a;r++){const o=e[t.shapes[r]];n.push(o)}const i=t.options.extrudePath;return i!==void 0&&(t.options.extrudePath=new Pl[i.type]().fromJSON(i)),new lc(n,t.options)}}const Z_={generateTopUV:function(s,t,e,n,i){const r=t[e*3],a=t[e*3+1],o=t[n*3],l=t[n*3+1],c=t[i*3],h=t[i*3+1];return[new it(r,a),new it(o,l),new it(c,h)]},generateSideWallUV:function(s,t,e,n,i,r){const a=t[e*3],o=t[e*3+1],l=t[e*3+2],c=t[n*3],h=t[n*3+1],f=t[n*3+2],u=t[i*3],d=t[i*3+1],p=t[i*3+2],_=t[r*3],g=t[r*3+1],m=t[r*3+2];return Math.abs(o-h)<Math.abs(a-c)?[new it(a,1-l),new it(c,1-f),new it(u,1-p),new it(_,1-m)]:[new it(o,1-l),new it(h,1-f),new it(d,1-p),new it(g,1-m)]}};function $_(s,t,e){if(e.shapes=[],Array.isArray(s))for(let n=0,i=s.length;n<i;n++){const r=s[n];e.shapes.push(r.uuid)}else e.shapes.push(s.uuid);return e.options=Object.assign({},t),t.extrudePath!==void 0&&(e.options.extrudePath=t.extrudePath.toJSON()),e}class cc extends ts{constructor(t=1,e=0){const n=(1+Math.sqrt(5))/2,i=[-1,n,0,1,n,0,-1,-n,0,1,-n,0,0,-1,n,0,1,n,0,-1,-n,0,1,-n,n,0,-1,n,0,1,-n,0,-1,-n,0,1],r=[0,11,5,0,5,1,0,1,7,0,7,10,0,10,11,1,5,9,5,11,4,11,10,2,10,7,6,7,1,8,3,9,4,3,4,2,3,2,6,3,6,8,3,8,9,4,9,5,2,4,11,6,2,10,8,6,7,9,8,1];super(i,r,t,e),this.type="IcosahedronGeometry",this.parameters={radius:t,detail:e}}static fromJSON(t){return new cc(t.radius,t.detail)}}class hc extends Zt{constructor(t=[new it(0,-.5),new it(.5,0),new it(0,.5)],e=12,n=0,i=Math.PI*2){super(),this.type="LatheGeometry",this.parameters={points:t,segments:e,phiStart:n,phiLength:i},e=Math.floor(e),i=Ht(i,0,Math.PI*2);const r=[],a=[],o=[],l=[],c=[],h=1/e,f=new I,u=new it,d=new I,p=new I,_=new I;let g=0,m=0;for(let x=0;x<=t.length-1;x++)switch(x){case 0:g=t[x+1].x-t[x].x,m=t[x+1].y-t[x].y,d.x=m*1,d.y=-g,d.z=m*0,_.copy(d),d.normalize(),l.push(d.x,d.y,d.z);break;case t.length-1:l.push(_.x,_.y,_.z);break;default:g=t[x+1].x-t[x].x,m=t[x+1].y-t[x].y,d.x=m*1,d.y=-g,d.z=m*0,p.copy(d),d.x+=_.x,d.y+=_.y,d.z+=_.z,d.normalize(),l.push(d.x,d.y,d.z),_.copy(p)}for(let x=0;x<=e;x++){const M=n+x*h*i,y=Math.sin(M),w=Math.cos(M);for(let b=0;b<=t.length-1;b++){f.x=t[b].x*y,f.y=t[b].y,f.z=t[b].x*w,a.push(f.x,f.y,f.z),u.x=x/e,u.y=b/(t.length-1),o.push(u.x,u.y);const E=l[3*b+0]*y,v=l[3*b+1],T=l[3*b+0]*w;c.push(E,v,T)}}for(let x=0;x<e;x++)for(let M=0;M<t.length-1;M++){const y=M+x*t.length,w=y,b=y+t.length,E=y+t.length+1,v=y+1;r.push(w,b,v),r.push(E,v,b)}this.setIndex(r),this.setAttribute("position",new Mt(a,3)),this.setAttribute("uv",new Mt(o,2)),this.setAttribute("normal",new Mt(c,3))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new hc(t.points,t.segments,t.phiStart,t.phiLength)}}class ka extends ts{constructor(t=1,e=0){const n=[1,0,0,-1,0,0,0,1,0,0,-1,0,0,0,1,0,0,-1],i=[0,2,4,0,4,3,0,3,5,0,5,2,1,2,5,1,5,3,1,3,4,1,4,2];super(n,i,t,e),this.type="OctahedronGeometry",this.parameters={radius:t,detail:e}}static fromJSON(t){return new ka(t.radius,t.detail)}}class Ps extends Zt{constructor(t=1,e=1,n=1,i=1){super(),this.type="PlaneGeometry",this.parameters={width:t,height:e,widthSegments:n,heightSegments:i};const r=t/2,a=e/2,o=Math.floor(n),l=Math.floor(i),c=o+1,h=l+1,f=t/o,u=e/l,d=[],p=[],_=[],g=[];for(let m=0;m<h;m++){const x=m*u-a;for(let M=0;M<c;M++){const y=M*f-r;p.push(y,-x,0),_.push(0,0,1),g.push(M/o),g.push(1-m/l)}}for(let m=0;m<l;m++)for(let x=0;x<o;x++){const M=x+c*m,y=x+c*(m+1),w=x+1+c*(m+1),b=x+1+c*m;d.push(M,y,b),d.push(y,w,b)}this.setIndex(d),this.setAttribute("position",new Mt(p,3)),this.setAttribute("normal",new Mt(_,3)),this.setAttribute("uv",new Mt(g,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new Ps(t.width,t.height,t.widthSegments,t.heightSegments)}}class uc extends Zt{constructor(t=.5,e=1,n=32,i=1,r=0,a=Math.PI*2){super(),this.type="RingGeometry",this.parameters={innerRadius:t,outerRadius:e,thetaSegments:n,phiSegments:i,thetaStart:r,thetaLength:a},n=Math.max(3,n),i=Math.max(1,i);const o=[],l=[],c=[],h=[];let f=t;const u=(e-t)/i,d=new I,p=new it;for(let _=0;_<=i;_++){for(let g=0;g<=n;g++){const m=r+g/n*a;d.x=f*Math.cos(m),d.y=f*Math.sin(m),l.push(d.x,d.y,d.z),c.push(0,0,1),p.x=(d.x/e+1)/2,p.y=(d.y/e+1)/2,h.push(p.x,p.y)}f+=u}for(let _=0;_<i;_++){const g=_*(n+1);for(let m=0;m<n;m++){const x=m+g,M=x,y=x+n+1,w=x+n+2,b=x+1;o.push(M,y,b),o.push(y,w,b)}}this.setIndex(o),this.setAttribute("position",new Mt(l,3)),this.setAttribute("normal",new Mt(c,3)),this.setAttribute("uv",new Mt(h,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new uc(t.innerRadius,t.outerRadius,t.thetaSegments,t.phiSegments,t.thetaStart,t.thetaLength)}}class dc extends Zt{constructor(t=new za([new it(0,.5),new it(-.5,-.5),new it(.5,-.5)]),e=12){super(),this.type="ShapeGeometry",this.parameters={shapes:t,curveSegments:e};const n=[],i=[],r=[],a=[];let o=0,l=0;if(Array.isArray(t)===!1)c(t);else for(let h=0;h<t.length;h++)c(t[h]),this.addGroup(o,l,h),o+=l,l=0;this.setIndex(n),this.setAttribute("position",new Mt(i,3)),this.setAttribute("normal",new Mt(r,3)),this.setAttribute("uv",new Mt(a,2));function c(h){const f=i.length/3,u=h.extractPoints(e);let d=u.shape;const p=u.holes;qn.isClockWise(d)===!1&&(d=d.reverse());for(let g=0,m=p.length;g<m;g++){const x=p[g];qn.isClockWise(x)===!0&&(p[g]=x.reverse())}const _=qn.triangulateShape(d,p);for(let g=0,m=p.length;g<m;g++){const x=p[g];d=d.concat(x)}for(let g=0,m=d.length;g<m;g++){const x=d[g];i.push(x.x,x.y,0),r.push(0,0,1),a.push(x.x,x.y)}for(let g=0,m=_.length;g<m;g++){const x=_[g],M=x[0]+f,y=x[1]+f,w=x[2]+f;n.push(M,y,w),l+=3}}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}toJSON(){const t=super.toJSON(),e=this.parameters.shapes;return J_(e,t)}static fromJSON(t,e){const n=[];for(let i=0,r=t.shapes.length;i<r;i++){const a=e[t.shapes[i]];n.push(a)}return new dc(n,t.curveSegments)}}function J_(s,t){if(t.shapes=[],Array.isArray(s))for(let e=0,n=s.length;e<n;e++){const i=s[e];t.shapes.push(i.uuid)}else t.shapes.push(s.uuid);return t}class Tr extends Zt{constructor(t=1,e=32,n=16,i=0,r=Math.PI*2,a=0,o=Math.PI){super(),this.type="SphereGeometry",this.parameters={radius:t,widthSegments:e,heightSegments:n,phiStart:i,phiLength:r,thetaStart:a,thetaLength:o},e=Math.max(3,Math.floor(e)),n=Math.max(2,Math.floor(n));const l=Math.min(a+o,Math.PI);let c=0;const h=[],f=new I,u=new I,d=[],p=[],_=[],g=[];for(let m=0;m<=n;m++){const x=[],M=m/n,y=a+M*o,w=t*Math.cos(y),b=Math.sqrt(t*t-w*w);let E=0;m===0&&a===0?E=.5/e:m===n&&l===Math.PI&&(E=-.5/e);for(let v=0;v<=e;v++){const T=v/e,C=i+T*r;f.x=-b*Math.cos(C),f.y=w,f.z=b*Math.sin(C),p.push(f.x,f.y,f.z),u.copy(f).normalize(),_.push(u.x,u.y,u.z),g.push(T+E,1-M),x.push(c++)}h.push(x)}for(let m=0;m<n;m++)for(let x=0;x<e;x++){const M=h[m][x+1],y=h[m][x],w=h[m+1][x],b=h[m+1][x+1];(m!==0||a>0)&&d.push(M,y,b),(m!==n-1||l<Math.PI)&&d.push(y,w,b)}this.setIndex(d),this.setAttribute("position",new Mt(p,3)),this.setAttribute("normal",new Mt(_,3)),this.setAttribute("uv",new Mt(g,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new Tr(t.radius,t.widthSegments,t.heightSegments,t.phiStart,t.phiLength,t.thetaStart,t.thetaLength)}}class fc extends ts{constructor(t=1,e=0){const n=[1,1,1,-1,-1,1,-1,1,-1,1,-1,-1],i=[2,1,0,0,3,2,1,3,0,2,3,1];super(n,i,t,e),this.type="TetrahedronGeometry",this.parameters={radius:t,detail:e}}static fromJSON(t){return new fc(t.radius,t.detail)}}class pc extends Zt{constructor(t=1,e=.4,n=12,i=48,r=Math.PI*2,a=0,o=Math.PI*2){super(),this.type="TorusGeometry",this.parameters={radius:t,tube:e,radialSegments:n,tubularSegments:i,arc:r,thetaStart:a,thetaLength:o},n=Math.floor(n),i=Math.floor(i);const l=[],c=[],h=[],f=[],u=new I,d=new I,p=new I;for(let _=0;_<=n;_++){const g=a+_/n*o;for(let m=0;m<=i;m++){const x=m/i*r;d.x=(t+e*Math.cos(g))*Math.cos(x),d.y=(t+e*Math.cos(g))*Math.sin(x),d.z=e*Math.sin(g),c.push(d.x,d.y,d.z),u.x=t*Math.cos(x),u.y=t*Math.sin(x),p.subVectors(d,u).normalize(),h.push(p.x,p.y,p.z),f.push(m/i),f.push(_/n)}}for(let _=1;_<=n;_++)for(let g=1;g<=i;g++){const m=(i+1)*_+g-1,x=(i+1)*(_-1)+g-1,M=(i+1)*(_-1)+g,y=(i+1)*_+g;l.push(m,x,y),l.push(x,M,y)}this.setIndex(l),this.setAttribute("position",new Mt(c,3)),this.setAttribute("normal",new Mt(h,3)),this.setAttribute("uv",new Mt(f,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new pc(t.radius,t.tube,t.radialSegments,t.tubularSegments,t.arc,t.thetaStart,t.thetaLength)}}class mc extends Zt{constructor(t=1,e=.4,n=64,i=8,r=2,a=3){super(),this.type="TorusKnotGeometry",this.parameters={radius:t,tube:e,tubularSegments:n,radialSegments:i,p:r,q:a},n=Math.floor(n),i=Math.floor(i);const o=[],l=[],c=[],h=[],f=new I,u=new I,d=new I,p=new I,_=new I,g=new I,m=new I;for(let M=0;M<=n;++M){const y=M/n*r*Math.PI*2;x(y,r,a,t,d),x(y+.01,r,a,t,p),g.subVectors(p,d),m.addVectors(p,d),_.crossVectors(g,m),m.crossVectors(_,g),_.normalize(),m.normalize();for(let w=0;w<=i;++w){const b=w/i*Math.PI*2,E=-e*Math.cos(b),v=e*Math.sin(b);f.x=d.x+(E*m.x+v*_.x),f.y=d.y+(E*m.y+v*_.y),f.z=d.z+(E*m.z+v*_.z),l.push(f.x,f.y,f.z),u.subVectors(f,d).normalize(),c.push(u.x,u.y,u.z),h.push(M/n),h.push(w/i)}}for(let M=1;M<=n;M++)for(let y=1;y<=i;y++){const w=(i+1)*(M-1)+(y-1),b=(i+1)*M+(y-1),E=(i+1)*M+y,v=(i+1)*(M-1)+y;o.push(w,b,v),o.push(b,E,v)}this.setIndex(o),this.setAttribute("position",new Mt(l,3)),this.setAttribute("normal",new Mt(c,3)),this.setAttribute("uv",new Mt(h,2));function x(M,y,w,b,E){const v=Math.cos(M),T=Math.sin(M),C=w/y*M,P=Math.cos(C);E.x=b*(2+P)*.5*v,E.y=b*(2+P)*T*.5,E.z=b*Math.sin(C)*.5}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new mc(t.radius,t.tube,t.tubularSegments,t.radialSegments,t.p,t.q)}}class gc extends Zt{constructor(t=new xu(new I(-1,-1,0),new I(-1,1,0),new I(1,1,0)),e=64,n=1,i=8,r=!1){super(),this.type="TubeGeometry",this.parameters={path:t,tubularSegments:e,radius:n,radialSegments:i,closed:r};const a=t.computeFrenetFrames(e,r);this.tangents=a.tangents,this.normals=a.normals,this.binormals=a.binormals;const o=new I,l=new I,c=new it;let h=new I;const f=[],u=[],d=[],p=[];_(),this.setIndex(p),this.setAttribute("position",new Mt(f,3)),this.setAttribute("normal",new Mt(u,3)),this.setAttribute("uv",new Mt(d,2));function _(){for(let M=0;M<e;M++)g(M);g(r===!1?e:0),x(),m()}function g(M){h=t.getPointAt(M/e,h);const y=a.normals[M],w=a.binormals[M];for(let b=0;b<=i;b++){const E=b/i*Math.PI*2,v=Math.sin(E),T=-Math.cos(E);l.x=T*y.x+v*w.x,l.y=T*y.y+v*w.y,l.z=T*y.z+v*w.z,l.normalize(),u.push(l.x,l.y,l.z),o.x=h.x+n*l.x,o.y=h.y+n*l.y,o.z=h.z+n*l.z,f.push(o.x,o.y,o.z)}}function m(){for(let M=1;M<=e;M++)for(let y=1;y<=i;y++){const w=(i+1)*(M-1)+(y-1),b=(i+1)*M+(y-1),E=(i+1)*M+y,v=(i+1)*(M-1)+y;p.push(w,b,v),p.push(b,E,v)}}function x(){for(let M=0;M<=e;M++)for(let y=0;y<=i;y++)c.x=M/e,c.y=y/i,d.push(c.x,c.y)}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}toJSON(){const t=super.toJSON();return t.path=this.parameters.path.toJSON(),t}static fromJSON(t){return new gc(new Pl[t.path.type]().fromJSON(t.path),t.tubularSegments,t.radius,t.radialSegments,t.closed)}}class Zp extends Zt{constructor(t=null){if(super(),this.type="WireframeGeometry",this.parameters={geometry:t},t!==null){const e=[],n=new Set,i=new I,r=new I;if(t.index!==null){const a=t.attributes.position,o=t.index;let l=t.groups;l.length===0&&(l=[{start:0,count:o.count,materialIndex:0}]);for(let c=0,h=l.length;c<h;++c){const f=l[c],u=f.start,d=f.count;for(let p=u,_=u+d;p<_;p+=3)for(let g=0;g<3;g++){const m=o.getX(p+g),x=o.getX(p+(g+1)%3);i.fromBufferAttribute(a,m),r.fromBufferAttribute(a,x),Hd(i,r,n)===!0&&(e.push(i.x,i.y,i.z),e.push(r.x,r.y,r.z))}}}else{const a=t.attributes.position;for(let o=0,l=a.count/3;o<l;o++)for(let c=0;c<3;c++){const h=3*o+c,f=3*o+(c+1)%3;i.fromBufferAttribute(a,h),r.fromBufferAttribute(a,f),Hd(i,r,n)===!0&&(e.push(i.x,i.y,i.z),e.push(r.x,r.y,r.z))}}this.setAttribute("position",new Mt(e,3))}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}}function Hd(s,t,e){const n=`${s.x},${s.y},${s.z}-${t.x},${t.y},${t.z}`,i=`${t.x},${t.y},${t.z}-${s.x},${s.y},${s.z}`;return e.has(n)===!0||e.has(i)===!0?!1:(e.add(n),e.add(i),!0)}var Wd=Object.freeze({__proto__:null,BoxGeometry:Ni,CapsuleGeometry:rc,CircleGeometry:Oa,ConeGeometry:Ba,CylinderGeometry:Ar,DodecahedronGeometry:ac,EdgesGeometry:Bp,ExtrudeGeometry:lc,IcosahedronGeometry:cc,LatheGeometry:hc,OctahedronGeometry:ka,PlaneGeometry:Ps,PolyhedronGeometry:ts,RingGeometry:uc,ShapeGeometry:dc,SphereGeometry:Tr,TetrahedronGeometry:fc,TorusGeometry:pc,TorusKnotGeometry:mc,TubeGeometry:gc,WireframeGeometry:Zp});class $p extends Ze{constructor(t){super(),this.isShadowMaterial=!0,this.type="ShadowMaterial",this.color=new ut(0),this.transparent=!0,this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.color.copy(t.color),this.fog=t.fog,this}}function vr(s){const t={};for(const e in s){t[e]={};for(const n in s[e]){const i=s[e][n];if(Xd(i))i.isRenderTargetTexture?(pt("UniformsUtils: Textures of render targets cannot be cloned via cloneUniforms() or mergeUniforms()."),t[e][n]=null):t[e][n]=i.clone();else if(Array.isArray(i))if(Xd(i[0])){const r=[];for(let a=0,o=i.length;a<o;a++)r[a]=i[a].clone();t[e][n]=r}else t[e][n]=i.slice();else t[e][n]=i}}return t}function ln(s){const t={};for(let e=0;e<s.length;e++){const n=vr(s[e]);for(const i in n)t[i]=n[i]}return t}function Xd(s){return s&&(s.isColor||s.isMatrix3||s.isMatrix4||s.isVector2||s.isVector3||s.isVector4||s.isTexture||s.isQuaternion)}function K_(s){const t=[];for(let e=0;e<s.length;e++)t.push(s[e].clone());return t}function Jp(s){const t=s.getRenderTarget();return t===null?s.outputColorSpace:t.isXRRenderTarget===!0?t.texture.colorSpace:ae.workingColorSpace}const Kp={clone:vr,merge:ln};var Q_=`void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,j_=`void main() {
	gl_FragColor = vec4( 1.0, 0.0, 0.0, 1.0 );
}`;class Fn extends Ze{constructor(t){super(),this.isShaderMaterial=!0,this.type="ShaderMaterial",this.defines={},this.uniforms={},this.uniformsGroups=[],this.vertexShader=Q_,this.fragmentShader=j_,this.linewidth=1,this.wireframe=!1,this.wireframeLinewidth=1,this.fog=!1,this.lights=!1,this.clipping=!1,this.forceSinglePass=!0,this.extensions={clipCullDistance:!1,multiDraw:!1},this.defaultAttributeValues={color:[1,1,1],uv:[0,0],uv1:[0,0]},this.index0AttributeName=void 0,this.uniformsNeedUpdate=!1,this.glslVersion=null,t!==void 0&&this.setValues(t)}copy(t){return super.copy(t),this.fragmentShader=t.fragmentShader,this.vertexShader=t.vertexShader,this.uniforms=vr(t.uniforms),this.uniformsGroups=K_(t.uniformsGroups),this.defines=Object.assign({},t.defines),this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.fog=t.fog,this.lights=t.lights,this.clipping=t.clipping,this.extensions=Object.assign({},t.extensions),this.glslVersion=t.glslVersion,this.defaultAttributeValues=Object.assign({},t.defaultAttributeValues),this.index0AttributeName=t.index0AttributeName,this.uniformsNeedUpdate=t.uniformsNeedUpdate,this}toJSON(t){const e=super.toJSON(t);e.glslVersion=this.glslVersion,e.uniforms={};for(const i in this.uniforms){const a=this.uniforms[i].value;a&&a.isTexture?e.uniforms[i]={type:"t",value:a.toJSON(t).uuid}:a&&a.isColor?e.uniforms[i]={type:"c",value:a.getHex()}:a&&a.isVector2?e.uniforms[i]={type:"v2",value:a.toArray()}:a&&a.isVector3?e.uniforms[i]={type:"v3",value:a.toArray()}:a&&a.isVector4?e.uniforms[i]={type:"v4",value:a.toArray()}:a&&a.isMatrix3?e.uniforms[i]={type:"m3",value:a.toArray()}:a&&a.isMatrix4?e.uniforms[i]={type:"m4",value:a.toArray()}:e.uniforms[i]={value:a}}Object.keys(this.defines).length>0&&(e.defines=this.defines),e.vertexShader=this.vertexShader,e.fragmentShader=this.fragmentShader,e.lights=this.lights,e.clipping=this.clipping;const n={};for(const i in this.extensions)this.extensions[i]===!0&&(n[i]=!0);return Object.keys(n).length>0&&(e.extensions=n),e}fromJSON(t,e){if(super.fromJSON(t,e),t.uniforms!==void 0)for(const n in t.uniforms){const i=t.uniforms[n];switch(this.uniforms[n]={},i.type){case"t":this.uniforms[n].value=e[i.value]||null;break;case"c":this.uniforms[n].value=new ut().setHex(i.value);break;case"v2":this.uniforms[n].value=new it().fromArray(i.value);break;case"v3":this.uniforms[n].value=new I().fromArray(i.value);break;case"v4":this.uniforms[n].value=new xe().fromArray(i.value);break;case"m3":this.uniforms[n].value=new Jt().fromArray(i.value);break;case"m4":this.uniforms[n].value=new Yt().fromArray(i.value);break;default:this.uniforms[n].value=i.value}}if(t.defines!==void 0&&(this.defines=t.defines),t.vertexShader!==void 0&&(this.vertexShader=t.vertexShader),t.fragmentShader!==void 0&&(this.fragmentShader=t.fragmentShader),t.glslVersion!==void 0&&(this.glslVersion=t.glslVersion),t.extensions!==void 0)for(const n in t.extensions)this.extensions[n]=t.extensions[n];return t.lights!==void 0&&(this.lights=t.lights),t.clipping!==void 0&&(this.clipping=t.clipping),this}}class vu extends Fn{constructor(t){super(t),this.isRawShaderMaterial=!0,this.type="RawShaderMaterial"}}class Mu extends Ze{constructor(t){super(),this.isMeshStandardMaterial=!0,this.type="MeshStandardMaterial",this.defines={STANDARD:""},this.color=new ut(16777215),this.roughness=1,this.metalness=0,this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.emissive=new ut(0),this.emissiveIntensity=1,this.emissiveMap=null,this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=Pi,this.normalScale=new it(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.roughnessMap=null,this.metalnessMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new $n,this.envMapIntensity=1,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.flatShading=!1,this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.defines={STANDARD:""},this.color.copy(t.color),this.roughness=t.roughness,this.metalness=t.metalness,this.map=t.map,this.lightMap=t.lightMap,this.lightMapIntensity=t.lightMapIntensity,this.aoMap=t.aoMap,this.aoMapIntensity=t.aoMapIntensity,this.emissive.copy(t.emissive),this.emissiveMap=t.emissiveMap,this.emissiveIntensity=t.emissiveIntensity,this.bumpMap=t.bumpMap,this.bumpScale=t.bumpScale,this.normalMap=t.normalMap,this.normalMapType=t.normalMapType,this.normalScale.copy(t.normalScale),this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this.roughnessMap=t.roughnessMap,this.metalnessMap=t.metalnessMap,this.alphaMap=t.alphaMap,this.envMap=t.envMap,this.envMapRotation.copy(t.envMapRotation),this.envMapIntensity=t.envMapIntensity,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.wireframeLinecap=t.wireframeLinecap,this.wireframeLinejoin=t.wireframeLinejoin,this.flatShading=t.flatShading,this.fog=t.fog,this}}class Qp extends Mu{constructor(t){super(),this.isMeshPhysicalMaterial=!0,this.defines={STANDARD:"",PHYSICAL:""},this.type="MeshPhysicalMaterial",this.anisotropyRotation=0,this.anisotropyMap=null,this.clearcoatMap=null,this.clearcoatRoughness=0,this.clearcoatRoughnessMap=null,this.clearcoatNormalScale=new it(1,1),this.clearcoatNormalMap=null,this.ior=1.5,Object.defineProperty(this,"reflectivity",{get:function(){return Ht(2.5*(this.ior-1)/(this.ior+1),0,1)},set:function(e){this.ior=(1+.4*e)/(1-.4*e)}}),this.iridescenceMap=null,this.iridescenceIOR=1.3,this.iridescenceThicknessRange=[100,400],this.iridescenceThicknessMap=null,this.sheenColor=new ut(0),this.sheenColorMap=null,this.sheenRoughness=1,this.sheenRoughnessMap=null,this.transmissionMap=null,this.thickness=0,this.thicknessMap=null,this.attenuationDistance=1/0,this.attenuationColor=new ut(1,1,1),this.specularIntensity=1,this.specularIntensityMap=null,this.specularColor=new ut(1,1,1),this.specularColorMap=null,this._anisotropy=0,this._clearcoat=0,this._dispersion=0,this._iridescence=0,this._retroreflectivity=0,this._sheen=0,this._transmission=0,this.setValues(t)}get anisotropy(){return this._anisotropy}set anisotropy(t){this._anisotropy>0!=t>0&&this.version++,this._anisotropy=t}get clearcoat(){return this._clearcoat}set clearcoat(t){this._clearcoat>0!=t>0&&this.version++,this._clearcoat=t}get iridescence(){return this._iridescence}set iridescence(t){this._iridescence>0!=t>0&&this.version++,this._iridescence=t}get dispersion(){return this._dispersion}set dispersion(t){this._dispersion>0!=t>0&&this.version++,this._dispersion=t}get retroreflectivity(){return this._retroreflectivity}set retroreflectivity(t){this._retroreflectivity>0!=t>0&&this.version++,this._retroreflectivity=t}get sheen(){return this._sheen}set sheen(t){this._sheen>0!=t>0&&this.version++,this._sheen=t}get transmission(){return this._transmission}set transmission(t){this._transmission>0!=t>0&&this.version++,this._transmission=t}copy(t){return super.copy(t),this.defines={STANDARD:"",PHYSICAL:""},this.anisotropy=t.anisotropy,this.anisotropyRotation=t.anisotropyRotation,this.anisotropyMap=t.anisotropyMap,this.clearcoat=t.clearcoat,this.clearcoatMap=t.clearcoatMap,this.clearcoatRoughness=t.clearcoatRoughness,this.clearcoatRoughnessMap=t.clearcoatRoughnessMap,this.clearcoatNormalMap=t.clearcoatNormalMap,this.clearcoatNormalScale.copy(t.clearcoatNormalScale),this.dispersion=t.dispersion,this.ior=t.ior,this.iridescence=t.iridescence,this.iridescenceMap=t.iridescenceMap,this.iridescenceIOR=t.iridescenceIOR,this.iridescenceThicknessRange=[...t.iridescenceThicknessRange],this.iridescenceThicknessMap=t.iridescenceThicknessMap,this.retroreflectivity=t.retroreflectivity,this.sheen=t.sheen,this.sheenColor.copy(t.sheenColor),this.sheenColorMap=t.sheenColorMap,this.sheenRoughness=t.sheenRoughness,this.sheenRoughnessMap=t.sheenRoughnessMap,this.transmission=t.transmission,this.transmissionMap=t.transmissionMap,this.thickness=t.thickness,this.thicknessMap=t.thicknessMap,this.attenuationDistance=t.attenuationDistance,this.attenuationColor.copy(t.attenuationColor),this.specularIntensity=t.specularIntensity,this.specularIntensityMap=t.specularIntensityMap,this.specularColor.copy(t.specularColor),this.specularColorMap=t.specularColorMap,this}}class jp extends Ze{constructor(t){super(),this.isMeshPhongMaterial=!0,this.type="MeshPhongMaterial",this.color=new ut(16777215),this.specular=new ut(1118481),this.shininess=30,this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.emissive=new ut(0),this.emissiveIntensity=1,this.emissiveMap=null,this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=Pi,this.normalScale=new it(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new $n,this.combine=Da,this.reflectivity=1,this.envMapIntensity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.flatShading=!1,this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.color.copy(t.color),this.specular.copy(t.specular),this.shininess=t.shininess,this.map=t.map,this.lightMap=t.lightMap,this.lightMapIntensity=t.lightMapIntensity,this.aoMap=t.aoMap,this.aoMapIntensity=t.aoMapIntensity,this.emissive.copy(t.emissive),this.emissiveMap=t.emissiveMap,this.emissiveIntensity=t.emissiveIntensity,this.bumpMap=t.bumpMap,this.bumpScale=t.bumpScale,this.normalMap=t.normalMap,this.normalMapType=t.normalMapType,this.normalScale.copy(t.normalScale),this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this.specularMap=t.specularMap,this.alphaMap=t.alphaMap,this.envMap=t.envMap,this.envMapRotation.copy(t.envMapRotation),this.combine=t.combine,this.reflectivity=t.reflectivity,this.envMapIntensity=t.envMapIntensity,this.refractionRatio=t.refractionRatio,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.wireframeLinecap=t.wireframeLinecap,this.wireframeLinejoin=t.wireframeLinejoin,this.flatShading=t.flatShading,this.fog=t.fog,this}}class tm extends Ze{constructor(t){super(),this.isMeshToonMaterial=!0,this.defines={TOON:""},this.type="MeshToonMaterial",this.color=new ut(16777215),this.map=null,this.gradientMap=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.emissive=new ut(0),this.emissiveIntensity=1,this.emissiveMap=null,this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=Pi,this.normalScale=new it(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.alphaMap=null,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.color.copy(t.color),this.map=t.map,this.gradientMap=t.gradientMap,this.lightMap=t.lightMap,this.lightMapIntensity=t.lightMapIntensity,this.aoMap=t.aoMap,this.aoMapIntensity=t.aoMapIntensity,this.emissive.copy(t.emissive),this.emissiveMap=t.emissiveMap,this.emissiveIntensity=t.emissiveIntensity,this.bumpMap=t.bumpMap,this.bumpScale=t.bumpScale,this.normalMap=t.normalMap,this.normalMapType=t.normalMapType,this.normalScale.copy(t.normalScale),this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this.alphaMap=t.alphaMap,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.wireframeLinecap=t.wireframeLinecap,this.wireframeLinejoin=t.wireframeLinejoin,this.fog=t.fog,this}}class em extends Ze{constructor(t){super(),this.isMeshNormalMaterial=!0,this.type="MeshNormalMaterial",this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=Pi,this.normalScale=new it(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.wireframe=!1,this.wireframeLinewidth=1,this.flatShading=!1,this.setValues(t)}copy(t){return super.copy(t),this.bumpMap=t.bumpMap,this.bumpScale=t.bumpScale,this.normalMap=t.normalMap,this.normalMapType=t.normalMapType,this.normalScale.copy(t.normalScale),this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.flatShading=t.flatShading,this}}class es extends Ze{constructor(t){super(),this.isMeshLambertMaterial=!0,this.type="MeshLambertMaterial",this.color=new ut(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.emissive=new ut(0),this.emissiveIntensity=1,this.emissiveMap=null,this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=Pi,this.normalScale=new it(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new $n,this.combine=Da,this.reflectivity=1,this.envMapIntensity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.flatShading=!1,this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.color.copy(t.color),this.map=t.map,this.lightMap=t.lightMap,this.lightMapIntensity=t.lightMapIntensity,this.aoMap=t.aoMap,this.aoMapIntensity=t.aoMapIntensity,this.emissive.copy(t.emissive),this.emissiveMap=t.emissiveMap,this.emissiveIntensity=t.emissiveIntensity,this.bumpMap=t.bumpMap,this.bumpScale=t.bumpScale,this.normalMap=t.normalMap,this.normalMapType=t.normalMapType,this.normalScale.copy(t.normalScale),this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this.specularMap=t.specularMap,this.alphaMap=t.alphaMap,this.envMap=t.envMap,this.envMapRotation.copy(t.envMapRotation),this.combine=t.combine,this.reflectivity=t.reflectivity,this.envMapIntensity=t.envMapIntensity,this.refractionRatio=t.refractionRatio,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.wireframeLinecap=t.wireframeLinecap,this.wireframeLinejoin=t.wireframeLinejoin,this.flatShading=t.flatShading,this.fog=t.fog,this}}class Su extends Ze{constructor(t){super(),this.isMeshDepthMaterial=!0,this.type="MeshDepthMaterial",this.depthPacking=mp,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.wireframe=!1,this.wireframeLinewidth=1,this.setValues(t)}copy(t){return super.copy(t),this.depthPacking=t.depthPacking,this.map=t.map,this.alphaMap=t.alphaMap,this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this}}class bu extends Ze{constructor(t){super(),this.isMeshDistanceMaterial=!0,this.type="MeshDistanceMaterial",this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.setValues(t)}copy(t){return super.copy(t),this.map=t.map,this.alphaMap=t.alphaMap,this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this}}class nm extends Ze{constructor(t){super(),this.isMeshMatcapMaterial=!0,this.defines={MATCAP:""},this.type="MeshMatcapMaterial",this.color=new ut(16777215),this.matcap=null,this.map=null,this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=Pi,this.normalScale=new it(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.alphaMap=null,this.wireframe=!1,this.wireframeLinewidth=1,this.flatShading=!1,this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.defines={MATCAP:""},this.color.copy(t.color),this.matcap=t.matcap,this.map=t.map,this.bumpMap=t.bumpMap,this.bumpScale=t.bumpScale,this.normalMap=t.normalMap,this.normalMapType=t.normalMapType,this.normalScale.copy(t.normalScale),this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this.alphaMap=t.alphaMap,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.flatShading=t.flatShading,this.fog=t.fog,this}}class im extends pn{constructor(t){super(),this.isLineDashedMaterial=!0,this.type="LineDashedMaterial",this.scale=1,this.dashSize=3,this.gapSize=1,this.setValues(t)}copy(t){return super.copy(t),this.scale=t.scale,this.dashSize=t.dashSize,this.gapSize=t.gapSize,this}}function Gn(s,t){return!s||s.constructor===t?s:typeof t.BYTES_PER_ELEMENT=="number"?new t(s):Array.prototype.slice.call(s)}function da(s){return s!==void 0&&s.inTangents!==void 0&&s.outTangents!==void 0}function sm(s){function t(i,r){return s[i]-s[r]}const e=s.length,n=new Array(e);for(let i=0;i!==e;++i)n[i]=i;return n.sort(t),n}function Rh(s,t,e){const n=s.length,i=new s.constructor(n);for(let r=0,a=0;a!==n;++r){const o=e[r]*t;for(let l=0;l!==t;++l)i[a++]=s[o+l]}return i}function rm(s,t,e,n){let i=1,r=s[0];for(;r!==void 0&&r[n]===void 0;)r=s[i++];if(r===void 0)return;let a=r[n];if(a!==void 0)if(Array.isArray(a))do a=r[n],a!==void 0&&(t.push(r.time),e.push(...a)),r=s[i++];while(r!==void 0);else if(a.toArray!==void 0)do a=r[n],a!==void 0&&(t.push(r.time),a.toArray(e,e.length)),r=s[i++];while(r!==void 0);else do a=r[n],a!==void 0&&(t.push(r.time),e.push(a)),r=s[i++];while(r!==void 0)}function tx(s,t,e,n,i=30){const r=s.clone();r.name=t;const a=[];for(let l=0;l<r.tracks.length;++l){const c=r.tracks[l],h=c.getValueSize(),f=[],u=[];for(let d=0;d<c.times.length;++d){const p=c.times[d]*i;if(!(p<e||p>=n)){f.push(c.times[d]);for(let _=0;_<h;++_)u.push(c.values[d*h+_])}}f.length!==0&&(c.times=Gn(f,c.times.constructor),c.values=Gn(u,c.values.constructor),a.push(c))}r.tracks=a;let o=1/0;for(let l=0;l<r.tracks.length;++l)o>r.tracks[l].times[0]&&(o=r.tracks[l].times[0]);for(let l=0;l<r.tracks.length;++l)r.tracks[l].shift(-1*o);return r.resetDuration(),r}function ex(s,t=0,e=s,n=30){n<=0&&(n=30);const i=e.tracks.length,r=t/n;for(let a=0;a<i;++a){const o=e.tracks[a],l=o.ValueTypeName;if(l==="bool"||l==="string")continue;const c=s.tracks.find(function(m){return m.name===o.name&&m.ValueTypeName===l});if(c===void 0)continue;let h=0;const f=o.getValueSize();o.createInterpolant.isInterpolantFactoryMethodGLTFCubicSpline&&(h=f/3);let u=0;const d=c.getValueSize();c.createInterpolant.isInterpolantFactoryMethodGLTFCubicSpline&&(u=d/3);const p=o.times.length-1;let _;if(r<=o.times[0]){const m=h,x=f-h;_=o.values.slice(m,x)}else if(r>=o.times[p]){const m=p*f+h,x=m+f-h;_=o.values.slice(m,x)}else{const m=o.createInterpolant(),x=h,M=f-h;m.evaluate(r),_=m.resultBuffer.slice(x,M)}l==="quaternion"&&new sn().fromArray(_).normalize().conjugate().toArray(_);const g=c.times.length;for(let m=0;m<g;++m){const x=m*d+u;if(l==="quaternion")sn.multiplyQuaternionsFlat(c.values,x,_,0,c.values,x);else{const M=d-u*2;for(let y=0;y<M;++y)c.values[x+y]-=_[y]}}}return s.blendMode=iu,s}class nx{static convertArray(t,e){return Gn(t,e)}static isTypedArray(t){return wp(t)}static hasTangents(t){return da(t)}static getKeyframeOrder(t){return sm(t)}static sortedArray(t,e,n){return Rh(t,e,n)}static flattenJSON(t,e,n,i){rm(t,e,n,i)}static subclip(t,e,n,i,r=30){return tx(t,e,n,i,r)}static makeClipAdditive(t,e=0,n=t,i=30){return ex(t,e,n,i)}}class Er{constructor(t,e,n,i){this.parameterPositions=t,this._cachedIndex=0,this.resultBuffer=i!==void 0?i:new e.constructor(n),this.sampleValues=e,this.valueSize=n,this.settings=null,this.DefaultSettings_={}}evaluate(t){const e=this.parameterPositions;let n=this._cachedIndex,i=e[n],r=e[n-1];t:{e:{let a;n:{i:if(!(t<i)){for(let o=n+2;;){if(i===void 0){if(t<r)break i;return n=e.length,this._cachedIndex=n,this.copySampleValue_(n-1)}if(n===o)break;if(r=i,i=e[++n],t<i)break e}a=e.length;break n}if(!(t>=r)){const o=e[1];t<o&&(n=2,r=o);for(let l=n-2;;){if(r===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(n===l)break;if(i=r,r=e[--n-1],t>=r)break e}a=n,n=0;break n}break t}for(;n<a;){const o=n+a>>>1;t<e[o]?a=o:n=o+1}if(i=e[n],r=e[n-1],r===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(i===void 0)return n=e.length,this._cachedIndex=n,this.copySampleValue_(n-1)}this._cachedIndex=n,this.intervalChanged_(n,r,i)}return this.interpolate_(n,r,t,i)}getSettings_(){return this.settings||this.DefaultSettings_}copySampleValue_(t){const e=this.resultBuffer,n=this.sampleValues,i=this.valueSize,r=t*i;for(let a=0;a!==i;++a)e[a]=n[r+a];return e}interpolate_(){throw new Error("THREE.Interpolant: Call to abstract method.")}intervalChanged_(){}}class am extends Er{constructor(t,e,n,i){super(t,e,n,i),this._weightPrev=-0,this._offsetPrev=-0,this._weightNext=-0,this._offsetNext=-0,this.DefaultSettings_={endingStart:ys,endingEnd:ys}}intervalChanged_(t,e,n){const i=this.parameterPositions;let r=t-2,a=t+1,o=i[r],l=i[a];if(o===void 0)switch(this.getSettings_().endingStart){case vs:r=t,o=2*e-n;break;case ya:r=i.length-2,o=e+i[r]-i[r+1];break;default:r=t,o=n}if(l===void 0)switch(this.getSettings_().endingEnd){case vs:a=t,l=2*n-e;break;case ya:a=1,l=n+i[1]-i[0];break;default:a=t-1,l=e}const c=(n-e)*.5,h=this.valueSize;this._weightPrev=c/(e-o),this._weightNext=c/(l-n),this._offsetPrev=r*h,this._offsetNext=a*h}interpolate_(t,e,n,i){const r=this.resultBuffer,a=this.sampleValues,o=this.valueSize,l=t*o,c=l-o,h=this._offsetPrev,f=this._offsetNext,u=this._weightPrev,d=this._weightNext,p=(n-e)/(i-e),_=p*p,g=_*p,m=-u*g+2*u*_-u*p,x=(1+u)*g+(-1.5-2*u)*_+(-.5+u)*p+1,M=(-1-d)*g+(1.5+d)*_+.5*p,y=d*g-d*_;for(let w=0;w!==o;++w)r[w]=m*a[h+w]+x*a[c+w]+M*a[l+w]+y*a[f+w];return r}}class wu extends Er{constructor(t,e,n,i){super(t,e,n,i)}interpolate_(t,e,n,i){const r=this.resultBuffer,a=this.sampleValues,o=this.valueSize,l=t*o,c=l-o,h=(n-e)/(i-e),f=1-h;for(let u=0;u!==o;++u)r[u]=a[c+u]*f+a[l+u]*h;return r}}class om extends Er{constructor(t,e,n,i){super(t,e,n,i)}interpolate_(t){return this.copySampleValue_(t-1)}}class lm extends Er{interpolate_(t,e,n,i){const r=this.resultBuffer,a=this.sampleValues,o=this.valueSize,l=t*o,c=l-o,h=this.inTangents,f=this.outTangents;if(!h||!f){const p=(n-e)/(i-e),_=1-p;for(let g=0;g!==o;++g)r[g]=a[c+g]*_+a[l+g]*p;return r}const u=o*2,d=t-1;for(let p=0;p!==o;++p){const _=a[c+p],g=a[l+p],m=d*u+p*2,x=f[m],M=f[m+1],y=t*u+p*2,w=h[y],b=h[y+1],E=sx(n,e,x,w,i);r[p]=cm(E,_,M,b,g)}return r}}function cm(s,t,e,n,i){const r=1-s;return r*r*r*t+3*r*r*s*e+3*r*s*s*n+s*s*s*i}function ix(s,t,e,n,i){const r=1-s;return 3*r*r*(e-t)+6*r*s*(n-e)+3*s*s*(i-n)}function sx(s,t,e,n,i){let r=(s-t)/(i-t);for(let a=0;a<8;a++){const o=cm(r,t,e,n,i)-s;if(Math.abs(o)<1e-10)break;const l=ix(r,t,e,n,i);if(Math.abs(l)<1e-10)break;r=Math.max(0,Math.min(1,r-o/l))}return r}class On{constructor(t,e,n,i){if(t===void 0)throw new Error("THREE.KeyframeTrack: track name is undefined");if(e===void 0||e.length===0)throw new Error("THREE.KeyframeTrack: no keyframes in track named "+t);this.name=t,this.times=Gn(e,this.TimeBufferType),this.values=Gn(n,this.ValueBufferType),this.setInterpolation(i||this.DefaultInterpolation)}static toJSON(t){const e=t.constructor;let n;if(e.toJSON!==this.toJSON)n=e.toJSON(t);else{n={name:t.name,times:Gn(t.times,Array),values:Gn(t.values,Array)};const i=t.getInterpolation();i!==t.DefaultInterpolation&&(n.interpolation=i),da(t.settings)&&(n.settings={inTangents:Gn(t.settings.inTangents,Array),outTangents:Gn(t.settings.outTangents,Array)})}return n.type=t.ValueTypeName,n}InterpolantFactoryMethodDiscrete(t){return new om(this.times,this.values,this.getValueSize(),t)}InterpolantFactoryMethodLinear(t){return new wu(this.times,this.values,this.getValueSize(),t)}InterpolantFactoryMethodSmooth(t){return new am(this.times,this.values,this.getValueSize(),t)}InterpolantFactoryMethodBezier(t){const e=new lm(this.times,this.values,this.getValueSize(),t);return this.settings&&(e.inTangents=this.settings.inTangents,e.outTangents=this.settings.outTangents),e}setInterpolation(t){let e;switch(t){case xa:e=this.InterpolantFactoryMethodDiscrete;break;case Cl:e=this.InterpolantFactoryMethodLinear;break;case Vo:e=this.InterpolantFactoryMethodSmooth;break;case wh:e=this.InterpolantFactoryMethodBezier;break}if(e===void 0){const n="unsupported interpolation for "+this.ValueTypeName+" keyframe track named "+this.name;if(this.createInterpolant===void 0)if(t!==this.DefaultInterpolation)this.setInterpolation(this.DefaultInterpolation);else throw new Error(n);return pt("KeyframeTrack:",n),this}return this.createInterpolant=e,this}getInterpolation(){switch(this.createInterpolant){case this.InterpolantFactoryMethodDiscrete:return xa;case this.InterpolantFactoryMethodLinear:return Cl;case this.InterpolantFactoryMethodSmooth:return Vo;case this.InterpolantFactoryMethodBezier:return wh}}getValueSize(){return this.values.length/this.times.length}shift(t){if(t!==0){const e=this.times;for(let n=0,i=e.length;n!==i;++n)e[n]+=t}return this}scale(t){if(t!==1){const e=this.times;for(let n=0,i=e.length;n!==i;++n)e[n]*=t;da(this.settings)&&(qd(this.settings.inTangents,t),qd(this.settings.outTangents,t))}return this}trim(t,e){const n=this.times,i=n.length;let r=0,a=i-1;for(;r!==i&&n[r]<t;)++r;for(;a!==-1&&n[a]>e;)--a;if(++a,r!==0||a!==i){r>=a&&(a=Math.max(a,1),r=a-1);const o=this.getValueSize();this.times=n.slice(r,a),this.values=this.values.slice(r*o,a*o)}return this}validate(){let t=!0;const e=this.getValueSize();e-Math.floor(e)!==0&&(Nt("KeyframeTrack: Invalid value size in track.",this),t=!1);const n=this.times,i=this.values,r=n.length;r===0&&(Nt("KeyframeTrack: Track is empty.",this),t=!1);let a=null;for(let o=0;o!==r;o++){const l=n[o];if(typeof l=="number"&&isNaN(l)){Nt("KeyframeTrack: Time is not a valid number.",this,o,l),t=!1;break}if(a!==null&&a>l){Nt("KeyframeTrack: Out of order keys.",this,o,l,a),t=!1;break}a=l}if(i!==void 0&&wp(i))for(let o=0,l=i.length;o!==l;++o){const c=i[o];if(isNaN(c)){Nt("KeyframeTrack: Value is not a valid number.",this,o,c),t=!1;break}}return t}optimize(){const t=this.times.slice(),e=this.values.slice(),n=this.getValueSize(),i=this.getInterpolation()===Vo,r=t.length-1;let a=1;for(let o=1;o<r;++o){let l=!1;const c=t[o],h=t[o+1];if(c!==h&&(o!==1||c!==t[0]))if(i)l=!0;else{const f=o*n,u=f-n,d=f+n;for(let p=0;p!==n;++p){const _=e[f+p];if(_!==e[u+p]||_!==e[d+p]){l=!0;break}}}if(l){if(o!==a){t[a]=t[o];const f=o*n,u=a*n;for(let d=0;d!==n;++d)e[u+d]=e[f+d]}++a}}if(r>0){t[a]=t[r];for(let o=r*n,l=a*n,c=0;c!==n;++c)e[l+c]=e[o+c];++a}return a!==t.length?(this.times=t.slice(0,a),this.values=e.slice(0,a*n)):(this.times=t,this.values=e),this}clone(){const t=this.times.slice(),e=this.values.slice(),n=this.constructor,i=new n(this.name,t,e);return i.createInterpolant=this.createInterpolant,da(this.settings)&&(i.settings={inTangents:this.settings.inTangents.slice(),outTangents:this.settings.outTangents.slice()}),i}}function qd(s,t){for(let e=0,n=s.length;e!==n;e+=2)s[e]*=t}On.prototype.ValueTypeName="";On.prototype.TimeBufferType=Float32Array;On.prototype.ValueBufferType=Float32Array;On.prototype.DefaultInterpolation=Cl;class Ls extends On{constructor(t,e,n){super(t,e,n)}}Ls.prototype.ValueTypeName="bool";Ls.prototype.ValueBufferType=Array;Ls.prototype.DefaultInterpolation=xa;Ls.prototype.InterpolantFactoryMethodLinear=void 0;Ls.prototype.InterpolantFactoryMethodSmooth=void 0;class Au extends On{constructor(t,e,n,i){super(t,e,n,i)}}Au.prototype.ValueTypeName="color";class _c extends On{constructor(t,e,n,i){super(t,e,n,i)}}_c.prototype.ValueTypeName="number";class hm extends Er{constructor(t,e,n,i){super(t,e,n,i)}interpolate_(t,e,n,i){const r=this.resultBuffer,a=this.sampleValues,o=this.valueSize,l=(n-e)/(i-e);let c=t*o;for(let h=c+o;c!==h;c+=4)sn.slerpFlat(r,0,a,c-o,a,c,l);return r}}class xc extends On{constructor(t,e,n,i){super(t,e,n,i)}InterpolantFactoryMethodLinear(t){return new hm(this.times,this.values,this.getValueSize(),t)}}xc.prototype.ValueTypeName="quaternion";xc.prototype.InterpolantFactoryMethodSmooth=void 0;class Ds extends On{constructor(t,e,n){super(t,e,n)}}Ds.prototype.ValueTypeName="string";Ds.prototype.ValueBufferType=Array;Ds.prototype.DefaultInterpolation=xa;Ds.prototype.InterpolantFactoryMethodLinear=void 0;Ds.prototype.InterpolantFactoryMethodSmooth=void 0;class Tu extends On{constructor(t,e,n,i){super(t,e,n,i)}}Tu.prototype.ValueTypeName="vector";class Ca{constructor(t="",e=-1,n=[],i=Yl){this.name=t,this.tracks=n,this.duration=e,this.blendMode=i,this.uuid=Cn(),this.userData={},this.duration<0&&this.resetDuration()}static parse(t){const e=[],n=t.tracks,i=1/(t.fps||1);for(let a=0,o=n.length;a!==o;++a)e.push(ax(n[a]).scale(i));const r=new this(t.name,t.duration,e,t.blendMode);return r.uuid=t.uuid,r.userData=JSON.parse(t.userData||"{}"),r}static toJSON(t){const e=[],n=t.tracks,i={name:t.name,duration:t.duration,tracks:e,uuid:t.uuid,blendMode:t.blendMode,userData:JSON.stringify(t.userData)};for(let r=0,a=n.length;r!==a;++r)e.push(On.toJSON(n[r]));return i}static CreateFromMorphTargetSequence(t,e,n,i){const r=e.length,a=[];for(let o=0;o<r;o++){let l=[],c=[];l.push((o+r-1)%r,o,(o+1)%r),c.push(0,1,0);const h=sm(l);l=Rh(l,1,h),c=Rh(c,1,h),!i&&l[0]===0&&(l.push(r),c.push(c[0])),a.push(new _c(".morphTargetInfluences["+e[o].name+"]",l,c).scale(1/n))}return new this(t,-1,a)}static findByName(t,e){let n=t;if(!Array.isArray(t)){const i=t;n=i.geometry&&i.geometry.animations||i.animations}for(let i=0;i<n.length;i++)if(n[i].name===e)return n[i];return null}static CreateClipsFromMorphTargetSequences(t,e,n){const i={},r=/^([\w-]*?)([\d]+)$/;for(let o=0,l=t.length;o<l;o++){const c=t[o],h=c.name.match(r);if(h&&h.length>1){const f=h[1];let u=i[f];u||(i[f]=u=[]),u.push(c)}}const a=[];for(const o in i)a.push(this.CreateFromMorphTargetSequence(o,i[o],e,n));return a}resetDuration(){const t=this.tracks;let e=0;for(let n=0,i=t.length;n!==i;++n){const r=this.tracks[n];e=Math.max(e,r.times[r.times.length-1])}return this.duration=e,this}trim(){for(let t=0;t<this.tracks.length;t++)this.tracks[t].trim(0,this.duration);return this}validate(){let t=!0;for(let e=0;e<this.tracks.length;e++)t=t&&this.tracks[e].validate();return t}optimize(){for(let t=0;t<this.tracks.length;t++)this.tracks[t].optimize();return this}clone(){const t=[];for(let n=0;n<this.tracks.length;n++)t.push(this.tracks[n].clone());const e=new this.constructor(this.name,this.duration,t,this.blendMode);return e.userData=JSON.parse(JSON.stringify(this.userData)),e}toJSON(){return this.constructor.toJSON(this)}}function rx(s){switch(s.toLowerCase()){case"scalar":case"double":case"float":case"number":case"integer":return _c;case"vector":case"vector2":case"vector3":case"vector4":return Tu;case"color":return Au;case"quaternion":return xc;case"bool":case"boolean":return Ls;case"string":return Ds}throw new Error("THREE.KeyframeTrack: Unsupported typeName: "+s)}function ax(s){if(s.type===void 0)throw new Error("THREE.KeyframeTrack: track type undefined, can not parse");const t=rx(s.type);if(s.times===void 0){const n=[],i=[];rm(s.keys,n,i,"value"),s.times=n,s.values=i}let e;return t.parse!==void 0?e=t.parse(s):e=new t(s.name,s.times,s.values,s.interpolation),da(s.settings)&&(e.settings={inTangents:Gn(s.settings.inTangents,Float32Array),outTangents:Gn(s.settings.outTangents,Float32Array)}),e}const ai={enabled:!1,files:{},add:function(s,t){this.enabled!==!1&&(Yd(s)||(this.files[s]=t))},get:function(s){if(this.enabled!==!1&&!Yd(s))return this.files[s]},remove:function(s){delete this.files[s]},clear:function(){this.files={}}};function Yd(s){try{const t=s.slice(s.indexOf(":")+1);return new URL(t).protocol==="blob:"}catch{return!1}}class Eu{constructor(t,e,n){const i=this;let r=!1,a=0,o=0,l;const c=[];this.onStart=void 0,this.onLoad=t,this.onProgress=e,this.onError=n,this._abortController=null,this.itemStart=function(h){o++,r===!1&&i.onStart!==void 0&&i.onStart(h,a,o),r=!0},this.itemEnd=function(h){a++,i.onProgress!==void 0&&i.onProgress(h,a,o),a===o&&(r=!1,i.onLoad!==void 0&&i.onLoad())},this.itemError=function(h){i.onError!==void 0&&i.onError(h)},this.resolveURL=function(h){return h=h.normalize("NFC"),l?l(h):h},this.setURLModifier=function(h){return l=h,this},this.addHandler=function(h,f){return c.push(h,f),this},this.removeHandler=function(h){const f=c.indexOf(h);return f!==-1&&c.splice(f,2),this},this.getHandler=function(h){for(let f=0,u=c.length;f<u;f+=2){const d=c[f],p=c[f+1];if(d.global&&(d.lastIndex=0),d.test(h))return p}return null},this.abort=function(){return this.abortController.abort(),this._abortController=null,this}}get abortController(){return this._abortController||(this._abortController=new AbortController),this._abortController}}const um=new Eu;class Sn{constructor(t){this.manager=t!==void 0?t:um,this.crossOrigin="anonymous",this.withCredentials=!1,this.path="",this.resourcePath="",this.requestHeader={},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}load(){}loadAsync(t,e){const n=this;return new Promise(function(i,r){n.load(t,i,e,r)})}parse(){}setCrossOrigin(t){return this.crossOrigin=t,this}setWithCredentials(t){return this.withCredentials=t,this}setPath(t){return this.path=t,this}setResourcePath(t){return this.resourcePath=t,this}setRequestHeader(t){return this.requestHeader=t,this}abort(){return this}}Sn.DEFAULT_MATERIAL_NAME="__DEFAULT";const xi={};class ox extends Error{constructor(t,e){super(t),this.response=e}}class Li extends Sn{constructor(t){super(t),this.mimeType="",this.responseType="",this._abortController=new AbortController}load(t,e,n,i){t===void 0&&(t=""),this.path!==void 0&&(t=this.path+t),t=this.manager.resolveURL(t);const r=ai.get(`file:${t}`);if(r!==void 0){this.manager.itemStart(t),setTimeout(()=>{e&&e(r),this.manager.itemEnd(t)},0);return}if(xi[t]!==void 0){xi[t].push({onLoad:e,onProgress:n,onError:i});return}xi[t]=[],xi[t].push({onLoad:e,onProgress:n,onError:i});const a=new Request(t,{headers:new Headers(this.requestHeader),credentials:this.withCredentials?"include":"same-origin",signal:typeof AbortSignal.any=="function"?AbortSignal.any([this._abortController.signal,this.manager.abortController.signal]):this._abortController.signal}),o=this.mimeType,l=this.responseType;fetch(a).then(c=>{if(c.status===200||c.status===0){if(c.status===0&&pt("FileLoader: HTTP Status 0 received."),typeof ReadableStream>"u"||c.body===void 0||c.body.getReader===void 0)return c;const h=xi[t],f=c.body.getReader(),u=c.headers.get("X-File-Size")||c.headers.get("Content-Length"),d=u?parseInt(u):0,p=d!==0;let _=0;const g=new ReadableStream({start(m){x();function x(){f.read().then(({done:M,value:y})=>{if(M)m.close();else{_+=y.byteLength;const w=new ProgressEvent("progress",{lengthComputable:p,loaded:_,total:d});for(let b=0,E=h.length;b<E;b++){const v=h[b];v.onProgress&&v.onProgress(w)}m.enqueue(y),x()}},M=>{m.error(M)})}}});return new Response(g)}else throw new ox(`fetch for "${c.url}" responded with ${c.status}: ${c.statusText}`,c)}).then(c=>{switch(l){case"arraybuffer":return c.arrayBuffer();case"blob":return c.blob();case"document":return c.text().then(h=>new DOMParser().parseFromString(h,o));case"json":return c.json();default:if(o==="")return c.text();{const f=/charset="?([^;"\s]*)"?/i.exec(o),u=f&&f[1]?f[1].toLowerCase():void 0,d=new TextDecoder(u);return c.arrayBuffer().then(p=>d.decode(p))}}}).then(c=>{ai.add(`file:${t}`,c);const h=xi[t];delete xi[t];for(let f=0,u=h.length;f<u;f++){const d=h[f];d.onLoad&&d.onLoad(c)}}).catch(c=>{const h=xi[t];if(h===void 0)throw this.manager.itemError(t),c;delete xi[t];for(let f=0,u=h.length;f<u;f++){const d=h[f];d.onError&&d.onError(c)}this.manager.itemError(t)}).finally(()=>{this.manager.itemEnd(t)}),this.manager.itemStart(t)}setResponseType(t){return this.responseType=t,this}setMimeType(t){return this.mimeType=t,this}abort(){return this._abortController.abort(),this._abortController=new AbortController,this}}class lx extends Sn{constructor(t){super(t)}load(t,e,n,i){const r=this,a=new Li(this.manager);a.setPath(this.path),a.setRequestHeader(this.requestHeader),a.setWithCredentials(this.withCredentials),a.load(t,function(o){try{e(r.parse(JSON.parse(o)))}catch(l){i?i(l):Nt(l),r.manager.itemError(t)}},n,i)}parse(t){const e=[];for(let n=0;n<t.length;n++){const i=Ca.parse(t[n]);e.push(i)}return e}}class cx extends Sn{constructor(t){super(t)}load(t,e,n,i){const r=this,a=[],o=new sc,l=new Li(this.manager);l.setPath(this.path),l.setResponseType("arraybuffer"),l.setRequestHeader(this.requestHeader),l.setWithCredentials(r.withCredentials);let c=0;function h(f){l.load(t[f],function(u){const d=r.parse(u,!0);a[f]={width:d.width,height:d.height,format:d.format,mipmaps:d.mipmaps},c+=1,c===6&&(d.mipmapCount===1&&(o.minFilter=Ae),o.image=a,o.format=d.format,o.needsUpdate=!0,e&&e(o))},n,i)}if(Array.isArray(t))for(let f=0,u=t.length;f<u;++f)h(f);else l.load(t,function(f){const u=r.parse(f,!0);if(u.isCubemap){const d=u.mipmaps.length/u.mipmapCount;for(let p=0;p<d;p++){a[p]={mipmaps:[]};for(let _=0;_<u.mipmapCount;_++)a[p].mipmaps.push(u.mipmaps[p*u.mipmapCount+_]),a[p].format=u.format,a[p].width=u.width,a[p].height=u.height}o.image=a}else o.image.width=u.width,o.image.height=u.height,o.mipmaps=u.mipmaps;u.mipmapCount===1&&(o.minFilter=Ae),o.format=u.format,o.needsUpdate=!0,e&&e(o)},n,i);return o}}const Ks=new WeakMap;class Ra extends Sn{constructor(t){super(t)}load(t,e,n,i){this.path!==void 0&&(t=this.path+t),t=this.manager.resolveURL(t);const r=this,a=ai.get(`image:${t}`);if(a!==void 0){if(a.complete===!0)r.manager.itemStart(t),setTimeout(function(){e&&e(a),r.manager.itemEnd(t)},0);else{let f=Ks.get(a);f===void 0&&(f=[],Ks.set(a,f)),f.push({onLoad:e,onError:i})}return a}const o=Sa("img");function l(){h(),e&&e(this);const f=Ks.get(this)||[];for(let u=0;u<f.length;u++){const d=f[u];d.onLoad&&d.onLoad(this)}Ks.delete(this),r.manager.itemEnd(t)}function c(f){h(),i&&i(f),ai.remove(`image:${t}`);const u=Ks.get(this)||[];for(let d=0;d<u.length;d++){const p=u[d];p.onError&&p.onError(f)}Ks.delete(this),r.manager.itemError(t),r.manager.itemEnd(t)}function h(){o.removeEventListener("load",l,!1),o.removeEventListener("error",c,!1)}return o.addEventListener("load",l,!1),o.addEventListener("error",c,!1),t.slice(0,5)!=="data:"&&this.crossOrigin!==void 0&&(o.crossOrigin=this.crossOrigin),ai.add(`image:${t}`,o),r.manager.itemStart(t),o.src=t,o}}class hx extends Sn{constructor(t){super(t)}load(t,e,n,i){const r=new Fa;r.colorSpace=cn;const a=new Ra(this.manager);a.setCrossOrigin(this.crossOrigin),a.setPath(this.path);let o=0;function l(c){a.load(t[c],function(h){r.images[c]=h,o++,o===6&&(r.needsUpdate=!0,e&&e(r))},void 0,i)}for(let c=0;c<t.length;++c)l(c);return r}}class ux extends Sn{constructor(t){super(t)}load(t,e,n,i){const r=this,a=new Nn,o=new Li(this.manager);return o.setResponseType("arraybuffer"),o.setRequestHeader(this.requestHeader),o.setPath(this.path),o.setWithCredentials(r.withCredentials),o.load(t,function(l){let c;try{c=r.parse(l)}catch(h){i!==void 0?i(h):Nt(h);return}r._applyTexData(a,c),e&&e(a,c)},n,i),a}createDataTexture(t){const e=new Nn;return this._applyTexData(e,this.parse(t)),e}_applyTexData(t,e){e.image!==void 0?t.image=e.image:e.data!==void 0&&(t.image.width=e.width,t.image.height=e.height,t.image.data=e.data),t.wrapS=e.wrapS!==void 0?e.wrapS:yn,t.wrapT=e.wrapT!==void 0?e.wrapT:yn,t.magFilter=e.magFilter!==void 0?e.magFilter:Ae,t.minFilter=e.minFilter!==void 0?e.minFilter:Ae,t.anisotropy=e.anisotropy!==void 0?e.anisotropy:1,e.colorSpace!==void 0&&(t.colorSpace=e.colorSpace),e.flipY!==void 0&&(t.flipY=e.flipY),e.format!==void 0&&(t.format=e.format),e.type!==void 0&&(t.type=e.type),e.mipmaps!==void 0&&(t.mipmaps=e.mipmaps,t.minFilter=ri),e.mipmapCount===1&&(t.minFilter=Ae),e.generateMipmaps!==void 0&&(t.generateMipmaps=e.generateMipmaps),t.needsUpdate=!0}}class dx extends Sn{constructor(t){super(t)}load(t,e,n,i){const r=new Ce,a=new Ra(this.manager);return a.setCrossOrigin(this.crossOrigin),a.setPath(this.path),a.load(t,function(o){r.image=o,r.needsUpdate=!0,e!==void 0&&e(r)},n,i),r}}class ns extends he{constructor(t,e=1){super(),this.isLight=!0,this.type="Light",this.color=new ut(t),this.intensity=e}copy(t,e){return super.copy(t,e),this.color.copy(t.color),this.intensity=t.intensity,this}toJSON(t){const e=super.toJSON(t);return e.object.color=this.color.getHex(),e.object.intensity=this.intensity,e}}class Cu extends ns{constructor(t,e,n){super(t,n),this.isHemisphereLight=!0,this.type="HemisphereLight",this.position.copy(he.DEFAULT_UP),this.updateMatrix(),this.groundColor=new ut(e)}copy(t,e){return super.copy(t,e),this.groundColor.copy(t.groundColor),this}toJSON(t){const e=super.toJSON(t);return e.object.groundColor=this.groundColor.getHex(),e}}const rh=new Yt,Zd=new I,$d=new I;class yc{constructor(t){this.camera=t,this.intensity=1,this.bias=0,this.biasNode=null,this.normalBias=0,this.radius=1,this.blurSamples=8,this.mapSize=new it(512,512),this.mapType=_n,this.map=null,this.mapPass=null,this.matrix=new Yt,this.autoUpdate=!0,this.needsUpdate=!1,this._frustum=new Es,this._frameExtents=new it(1,1),this._viewportCount=1,this._viewports=[new xe(0,0,1,1)]}getViewportCount(){return this._viewportCount}getCamera(){return this.camera}getFrustum(){return this._frustum}updateMatrices(t){const e=this.camera;Zd.setFromMatrixPosition(t.matrixWorld),e.position.copy(Zd),$d.setFromMatrixPosition(t.target.matrixWorld),e.lookAt($d),e.updateMatrixWorld(),this._updateMatrix(e,this.matrix,this._frustum)}_updateMatrix(t,e,n,i){rh.multiplyMatrices(t.projectionMatrix,t.matrixWorldInverse),n.setFromProjectionMatrix(rh,t.coordinateSystem,t.reversedDepth);const r=this._frameExtents,a=i?i.z/r.x:1,o=i?i.w/r.y:1,l=i?i.x/r.x:0,c=i?i.y/r.y:0;t.coordinateSystem===As||t.reversedDepth?e.set(.5*a,0,0,.5*a+l,0,.5*o,0,.5*o+c,0,0,1,0,0,0,0,1):e.set(.5*a,0,0,.5*a+l,0,.5*o,0,.5*o+c,0,0,.5,.5,0,0,0,1),e.multiply(rh)}getViewport(t){return this._viewports[t]}getFrameExtents(){return this._frameExtents}dispose(){this.map&&this.map.dispose(),this.mapPass&&this.mapPass.dispose()}copy(t){return this.camera=t.camera.clone(),this.intensity=t.intensity,this.bias=t.bias,this.radius=t.radius,this.autoUpdate=t.autoUpdate,this.needsUpdate=t.needsUpdate,this.normalBias=t.normalBias,this.blurSamples=t.blurSamples,this.mapSize.copy(t.mapSize),this.biasNode=t.biasNode,this}clone(){return new this.constructor().copy(this)}toJSON(){const t={};return t.intensity=this.intensity,t.bias=this.bias,t.normalBias=this.normalBias,t.radius=this.radius,t.blurSamples=this.blurSamples,t.mapSize=this.mapSize.toArray(),t.camera=this.camera.toJSON(!1).object,delete t.camera.matrix,t}}const Ao=new I,To=new sn,ti=new I;class vc extends he{constructor(){super(),this.isCamera=!0,this.type="Camera",this.matrixWorldInverse=new Yt,this.projectionMatrix=new Yt,this.projectionMatrixInverse=new Yt,this.coordinateSystem=En,this._reversedDepth=!1}get reversedDepth(){return this._reversedDepth}copy(t,e){return super.copy(t,e),this.matrixWorldInverse.copy(t.matrixWorldInverse),this.projectionMatrix.copy(t.projectionMatrix),this.projectionMatrixInverse.copy(t.projectionMatrixInverse),this.coordinateSystem=t.coordinateSystem,this}getWorldDirection(t){return super.getWorldDirection(t).negate()}updateMatrixWorld(t){super.updateMatrixWorld(t),this.matrixWorld.decompose(Ao,To,ti),ti.x===1&&ti.y===1&&ti.z===1?this.matrixWorldInverse.copy(this.matrixWorld).invert():this.matrixWorldInverse.compose(Ao,To,ti.set(1,1,1)).invert()}updateWorldMatrix(t,e,n=!1){super.updateWorldMatrix(t,e,n),this.matrixWorld.decompose(Ao,To,ti),ti.x===1&&ti.y===1&&ti.z===1?this.matrixWorldInverse.copy(this.matrixWorld).invert():this.matrixWorldInverse.compose(Ao,To,ti.set(1,1,1)).invert()}clone(){return new this.constructor().copy(this)}}const Gi=new I,Jd=new it,Kd=new it;class Xe extends vc{constructor(t=50,e=1,n=.1,i=2e3){super(),this.isPerspectiveCamera=!0,this.type="PerspectiveCamera",this.fov=t,this.zoom=1,this.near=n,this.far=i,this.focus=10,this.aspect=e,this.view=null,this.filmGauge=35,this.filmOffset=0,this.updateProjectionMatrix()}copy(t,e){return super.copy(t,e),this.fov=t.fov,this.zoom=t.zoom,this.near=t.near,this.far=t.far,this.focus=t.focus,this.aspect=t.aspect,this.view=t.view===null?null:Object.assign({},t.view),this.filmGauge=t.filmGauge,this.filmOffset=t.filmOffset,this}setFocalLength(t){const e=.5*this.getFilmHeight()/t;this.fov=gr*2*Math.atan(e),this.updateProjectionMatrix()}getFocalLength(){const t=Math.tan(Ss*.5*this.fov);return .5*this.getFilmHeight()/t}getEffectiveFOV(){return gr*2*Math.atan(Math.tan(Ss*.5*this.fov)/this.zoom)}getFilmWidth(){return this.filmGauge*Math.min(this.aspect,1)}getFilmHeight(){return this.filmGauge/Math.max(this.aspect,1)}getViewBounds(t,e,n){Gi.set(-1,-1,.5).applyMatrix4(this.projectionMatrixInverse),e.set(Gi.x,Gi.y).multiplyScalar(-t/Gi.z),Gi.set(1,1,.5).applyMatrix4(this.projectionMatrixInverse),n.set(Gi.x,Gi.y).multiplyScalar(-t/Gi.z)}getViewSize(t,e){return this.getViewBounds(t,Jd,Kd),e.subVectors(Kd,Jd)}setViewOffset(t,e,n,i,r,a){this.aspect=t/e,this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=t,this.view.fullHeight=e,this.view.offsetX=n,this.view.offsetY=i,this.view.width=r,this.view.height=a,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){const t=this.near;let e=t*Math.tan(Ss*.5*this.fov)/this.zoom,n=2*e,i=this.aspect*n,r=-.5*i;const a=this.view;if(this.view!==null&&this.view.enabled){const l=a.fullWidth,c=a.fullHeight;r+=a.offsetX*i/l,e-=a.offsetY*n/c,i*=a.width/l,n*=a.height/c}const o=this.filmOffset;o!==0&&(r+=t*o/this.getFilmWidth()),this.projectionMatrix.makePerspective(r,r+i,e,e-n,t,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(t){const e=super.toJSON(t);return e.object.fov=this.fov,e.object.zoom=this.zoom,e.object.near=this.near,e.object.far=this.far,e.object.focus=this.focus,e.object.aspect=this.aspect,this.view!==null&&(e.object.view=Object.assign({},this.view)),e.object.filmGauge=this.filmGauge,e.object.filmOffset=this.filmOffset,e}}class fx extends yc{constructor(){super(new Xe(50,1,.5,500)),this.isSpotLightShadow=!0,this.focus=1,this.aspect=1}updateMatrices(t){const e=this.camera,n=gr*2*t.angle*this.focus,i=this.mapSize.width/this.mapSize.height*this.aspect,r=t.distance||e.far;(n!==e.fov||i!==e.aspect||r!==e.far)&&(e.fov=n,e.aspect=i,e.far=r,e.updateProjectionMatrix()),super.updateMatrices(t)}copy(t){return super.copy(t),this.focus=t.focus,this.aspect=t.aspect,this}toJSON(){const t=super.toJSON();return t.focus=this.focus,t.aspect=this.aspect,t}}class dm extends ns{constructor(t,e,n=0,i=Math.PI/3,r=0,a=2){super(t,e),this.isSpotLight=!0,this.type="SpotLight",this.position.copy(he.DEFAULT_UP),this.updateMatrix(),this.target=new he,this.distance=n,this.angle=i,this.penumbra=r,this.decay=a,this.map=null,this.shadow=new fx}get power(){return this.intensity*Math.PI}set power(t){this.intensity=t/Math.PI}dispose(){super.dispose(),this.shadow.dispose()}copy(t,e){return super.copy(t,e),this.distance=t.distance,this.angle=t.angle,this.penumbra=t.penumbra,this.decay=t.decay,this.target=t.target.clone(),this.map=t.map,this.shadow=t.shadow.clone(),this}toJSON(t){const e=super.toJSON(t);return e.object.distance=this.distance,e.object.angle=this.angle,e.object.decay=this.decay,e.object.penumbra=this.penumbra,e.object.target=this.target.uuid,this.map&&this.map.isTexture&&(e.object.map=this.map.toJSON(t).uuid),e.object.shadow=this.shadow.toJSON(),e}}class px extends yc{constructor(){super(new Xe(90,1,.5,500)),this.isPointLightShadow=!0}}class fm extends ns{constructor(t,e,n=0,i=2){super(t,e),this.isPointLight=!0,this.type="PointLight",this.distance=n,this.decay=i,this.shadow=new px}get power(){return this.intensity*4*Math.PI}set power(t){this.intensity=t/(4*Math.PI)}dispose(){super.dispose(),this.shadow.dispose()}copy(t,e){return super.copy(t,e),this.distance=t.distance,this.decay=t.decay,this.shadow=t.shadow.clone(),this}toJSON(t){const e=super.toJSON(t);return e.object.distance=this.distance,e.object.decay=this.decay,e.object.shadow=this.shadow.toJSON(),e}}class Va extends vc{constructor(t=-1,e=1,n=1,i=-1,r=.1,a=2e3){super(),this.isOrthographicCamera=!0,this.type="OrthographicCamera",this.zoom=1,this.view=null,this.left=t,this.right=e,this.top=n,this.bottom=i,this.near=r,this.far=a,this.updateProjectionMatrix()}copy(t,e){return super.copy(t,e),this.left=t.left,this.right=t.right,this.top=t.top,this.bottom=t.bottom,this.near=t.near,this.far=t.far,this.zoom=t.zoom,this.view=t.view===null?null:Object.assign({},t.view),this}setViewOffset(t,e,n,i,r,a){this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=t,this.view.fullHeight=e,this.view.offsetX=n,this.view.offsetY=i,this.view.width=r,this.view.height=a,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){const t=(this.right-this.left)/(2*this.zoom),e=(this.top-this.bottom)/(2*this.zoom),n=(this.right+this.left)/2,i=(this.top+this.bottom)/2;let r=n-t,a=n+t,o=i+e,l=i-e;if(this.view!==null&&this.view.enabled){const c=(this.right-this.left)/this.view.fullWidth/this.zoom,h=(this.top-this.bottom)/this.view.fullHeight/this.zoom;r+=c*this.view.offsetX,a=r+c*this.view.width,o-=h*this.view.offsetY,l=o-h*this.view.height}this.projectionMatrix.makeOrthographic(r,a,o,l,this.near,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(t){const e=super.toJSON(t);return e.object.zoom=this.zoom,e.object.left=this.left,e.object.right=this.right,e.object.top=this.top,e.object.bottom=this.bottom,e.object.near=this.near,e.object.far=this.far,this.view!==null&&(e.object.view=Object.assign({},this.view)),e}}class mx extends yc{constructor(){super(new Va(-5,5,5,-5,.5,500)),this.isDirectionalLightShadow=!0}}class Ru extends ns{constructor(t,e){super(t,e),this.isDirectionalLight=!0,this.type="DirectionalLight",this.position.copy(he.DEFAULT_UP),this.updateMatrix(),this.target=new he,this.shadow=new mx}dispose(){super.dispose(),this.shadow.dispose()}copy(t){return super.copy(t),this.target=t.target.clone(),this.shadow=t.shadow.clone(),this}toJSON(t){const e=super.toJSON(t);return e.object.shadow=this.shadow.toJSON(),e.object.target=this.target.uuid,e}}class pm extends ns{constructor(t,e){super(t,e),this.isAmbientLight=!0,this.type="AmbientLight"}}class mm extends ns{constructor(t,e,n=10,i=10){super(t,e),this.isRectAreaLight=!0,this.type="RectAreaLight",this.width=n,this.height=i}get power(){return this.intensity*this.width*this.height*Math.PI}set power(t){this.intensity=t/(this.width*this.height*Math.PI)}copy(t){return super.copy(t),this.width=t.width,this.height=t.height,this}toJSON(t){const e=super.toJSON(t);return e.object.width=this.width,e.object.height=this.height,e}}class Iu{constructor(){this.isSphericalHarmonics3=!0,this.coefficients=[];for(let t=0;t<9;t++)this.coefficients.push(new I)}set(t){for(let e=0;e<9;e++)this.coefficients[e].copy(t[e]);return this}zero(){for(let t=0;t<9;t++)this.coefficients[t].set(0,0,0);return this}getAt(t,e){const n=t.x,i=t.y,r=t.z,a=this.coefficients;return e.copy(a[0]).multiplyScalar(.282095),e.addScaledVector(a[1],.488603*i),e.addScaledVector(a[2],.488603*r),e.addScaledVector(a[3],.488603*n),e.addScaledVector(a[4],1.092548*(n*i)),e.addScaledVector(a[5],1.092548*(i*r)),e.addScaledVector(a[6],.315392*(3*r*r-1)),e.addScaledVector(a[7],1.092548*(n*r)),e.addScaledVector(a[8],.546274*(n*n-i*i)),e}getIrradianceAt(t,e){const n=t.x,i=t.y,r=t.z,a=this.coefficients;return e.copy(a[0]).multiplyScalar(.886227),e.addScaledVector(a[1],2*.511664*i),e.addScaledVector(a[2],2*.511664*r),e.addScaledVector(a[3],2*.511664*n),e.addScaledVector(a[4],2*.429043*n*i),e.addScaledVector(a[5],2*.429043*i*r),e.addScaledVector(a[6],.743125*r*r-.247708),e.addScaledVector(a[7],2*.429043*n*r),e.addScaledVector(a[8],.429043*(n*n-i*i)),e}add(t){for(let e=0;e<9;e++)this.coefficients[e].add(t.coefficients[e]);return this}addScaledSH(t,e){for(let n=0;n<9;n++)this.coefficients[n].addScaledVector(t.coefficients[n],e);return this}scale(t){for(let e=0;e<9;e++)this.coefficients[e].multiplyScalar(t);return this}lerp(t,e){for(let n=0;n<9;n++)this.coefficients[n].lerp(t.coefficients[n],e);return this}equals(t){for(let e=0;e<9;e++)if(!this.coefficients[e].equals(t.coefficients[e]))return!1;return!0}copy(t){return this.set(t.coefficients)}clone(){return new this.constructor().copy(this)}fromArray(t,e=0){const n=this.coefficients;for(let i=0;i<9;i++)n[i].fromArray(t,e+i*3);return this}toArray(t=[],e=0){const n=this.coefficients;for(let i=0;i<9;i++)n[i].toArray(t,e+i*3);return t}static getBasisAt(t,e){const n=t.x,i=t.y,r=t.z;e[0]=.282095,e[1]=.488603*i,e[2]=.488603*r,e[3]=.488603*n,e[4]=1.092548*n*i,e[5]=1.092548*i*r,e[6]=.315392*(3*r*r-1),e[7]=1.092548*n*r,e[8]=.546274*(n*n-i*i)}}class gm extends ns{constructor(t=new Iu,e=1){super(void 0,e),this.isLightProbe=!0,this.sh=t}copy(t){return super.copy(t),this.sh.copy(t.sh),this}toJSON(t){const e=super.toJSON(t);return e.object.sh=this.sh.toArray(),e}}const Qd={};class Mc extends Sn{constructor(t){super(t),this.textures={}}load(t,e,n,i){const r=this,a=new Li(r.manager);a.setPath(r.path),a.setRequestHeader(r.requestHeader),a.setWithCredentials(r.withCredentials),a.load(t,function(o){try{e(r.parse(JSON.parse(o)))}catch(l){i?i(l):Nt(l),r.manager.itemError(t)}},n,i)}parse(t){const e=this.createMaterialFromType(t.type);return e.fromJSON(t,this.textures),e}setTextures(t){return this.textures=t,this}createMaterialFromType(t){return Mc.createMaterialFromType(t)}static createMaterialFromType(t){const n={ShadowMaterial:$p,SpriteMaterial:cu,RawShaderMaterial:vu,ShaderMaterial:Fn,PointsMaterial:du,MeshPhysicalMaterial:Qp,MeshStandardMaterial:Mu,MeshPhongMaterial:jp,MeshToonMaterial:tm,MeshNormalMaterial:em,MeshLambertMaterial:es,MeshDepthMaterial:Su,MeshDistanceMaterial:bu,MeshBasicMaterial:hi,MeshMatcapMaterial:nm,LineDashedMaterial:im,LineBasicMaterial:pn,Material:Ze,...Qd}[t];let i;return n===void 0?(Ci(`MaterialLoader: Unknown material type "${t}". Use .registerMaterial() before starting the deserialization process.`),i=new Ze):i=new n,i}static registerMaterial(t,e){Qd[t]=e}}class Ih{static extractUrlBase(t){const e=t.lastIndexOf("/");return e===-1?"./":t.slice(0,e+1)}static resolveURL(t,e){return typeof t!="string"||t===""?"":(/^https?:\/\//i.test(e)&&/^\//.test(t)&&(e=e.replace(/(^https?:\/\/[^\/]+).*/i,"$1")),/^(https?:)?\/\//i.test(t)||/^data:.*,.*$/i.test(t)||/^blob:.*$/i.test(t)?t:e+t)}}class _m extends Zt{constructor(){super(),this.isInstancedBufferGeometry=!0,this.type="InstancedBufferGeometry",this.instanceCount=1/0}copy(t){return super.copy(t),this.instanceCount=t.instanceCount,this}toJSON(){const t=super.toJSON();return t.instanceCount=this.instanceCount,t.isInstancedBufferGeometry=!0,t}}class xm extends Sn{constructor(t){super(t)}load(t,e,n,i){const r=this,a=new Li(r.manager);a.setPath(r.path),a.setRequestHeader(r.requestHeader),a.setWithCredentials(r.withCredentials),a.load(t,function(o){try{e(r.parse(JSON.parse(o)))}catch(l){i?i(l):Nt(l),r.manager.itemError(t)}},n,i)}parse(t){const e={},n={};function i(d,p){if(e[p]!==void 0)return e[p];const g=d.interleavedBuffers[p],m=r(d,g.buffer),x=ar(g.type,m),M=new ec(x,g.stride);return M.uuid=g.uuid,g.usage!==void 0&&M.setUsage(g.usage),e[p]=M,M}function r(d,p){if(n[p]!==void 0)return n[p];const g=d.arrayBuffers[p],m=new Uint32Array(g).buffer;return n[p]=m,m}const a=t.isInstancedBufferGeometry?new _m:new Zt,o=t.data.index;if(o!==void 0){const d=ar(o.type,o.array);a.setIndex(new ue(d,1))}const l=t.data.attributes;for(const d in l){const p=l[d];let _;if(p.isInterleavedBufferAttribute){const g=i(t.data,p.data);_=new Ts(g,p.itemSize,p.offset,p.normalized)}else{const g=ar(p.type,p.array),m=p.isInstancedBufferAttribute?_r:ue;_=new m(g,p.itemSize,p.normalized)}p.name!==void 0&&(_.name=p.name),p.usage!==void 0&&_.setUsage(p.usage),p.gpuType!==void 0&&(_.gpuType=p.gpuType),a.setAttribute(d,_)}const c=t.data.morphAttributes;if(c)for(const d in c){const p=c[d],_=[];for(let g=0,m=p.length;g<m;g++){const x=p[g];let M;if(x.isInterleavedBufferAttribute){const y=i(t.data,x.data);M=new Ts(y,x.itemSize,x.offset,x.normalized)}else{const y=ar(x.type,x.array);M=new ue(y,x.itemSize,x.normalized)}x.name!==void 0&&(M.name=x.name),x.usage!==void 0&&M.setUsage(x.usage),x.gpuType!==void 0&&(M.gpuType=x.gpuType),_.push(M)}a.morphAttributes[d]=_}t.data.morphTargetsRelative&&(a.morphTargetsRelative=!0);const f=t.data.groups||t.data.drawcalls||t.data.offsets;if(f!==void 0)for(let d=0,p=f.length;d!==p;++d){const _=f[d];a.addGroup(_.start,_.count,_.materialIndex)}const u=t.data.boundingSphere;return u!==void 0&&(a.boundingSphere=new Ye().fromJSON(u)),t.name&&(a.name=t.name),t.userData&&(a.userData=t.userData),a}}const ah={};class gx extends Sn{constructor(t){super(t)}load(t,e,n,i){const r=this,a=this.path===""?Ih.extractUrlBase(t):this.path;this.resourcePath=this.resourcePath||a;const o=new Li(this.manager);o.setPath(this.path),o.setRequestHeader(this.requestHeader),o.setWithCredentials(this.withCredentials),o.load(t,function(l){let c=null;try{c=JSON.parse(l)}catch(f){i!==void 0&&i(f),Nt("ObjectLoader: Can't parse "+t+".",f.message);return}const h=c.metadata;if(h===void 0||h.type===void 0||h.type.toLowerCase()==="geometry"){i!==void 0&&i(new Error("THREE.ObjectLoader: Can't load "+t)),Nt("ObjectLoader: Can't load "+t);return}r.parse(c,e)},n,i)}async loadAsync(t,e){const n=this,i=this.path===""?Ih.extractUrlBase(t):this.path;this.resourcePath=this.resourcePath||i;const r=new Li(this.manager);r.setPath(this.path),r.setRequestHeader(this.requestHeader),r.setWithCredentials(this.withCredentials);const a=await r.loadAsync(t,e);let o;try{o=JSON.parse(a)}catch(c){throw new Error("THREE.ObjectLoader: Can't parse "+t+". "+c.message)}const l=o.metadata;if(l===void 0||l.type===void 0||l.type.toLowerCase()==="geometry")throw new Error("THREE.ObjectLoader: Can't load "+t);return await n.parseAsync(o)}parse(t,e){const n=this.parseAnimations(t.animations),i=this.parseShapes(t.shapes),r=this.parseGeometries(t.geometries,i),a=this.parseImages(t.images,function(){e!==void 0&&e(c)}),o=this.parseTextures(t.textures,a),l=this.parseMaterials(t.materials,o),c=this.parseObject(t.object,r,l,o,n),h=this.parseSkeletons(t.skeletons,c);if(this.bindSkeletons(c,h),this.bindLightTargets(c),e!==void 0){let f=!1;for(const u in a)if(a[u].data instanceof HTMLImageElement){f=!0;break}f===!1&&e(c)}return c}async parseAsync(t){const e=this.parseAnimations(t.animations),n=this.parseShapes(t.shapes),i=this.parseGeometries(t.geometries,n),r=await this.parseImagesAsync(t.images),a=this.parseTextures(t.textures,r),o=this.parseMaterials(t.materials,a),l=this.parseObject(t.object,i,o,a,e),c=this.parseSkeletons(t.skeletons,l);return this.bindSkeletons(l,c),this.bindLightTargets(l),l}static registerGeometry(t,e){ah[t]=e}parseShapes(t){const e={};if(t!==void 0)for(let n=0,i=t.length;n<i;n++){const r=new za().fromJSON(t[n]);e[r.uuid]=r}return e}parseSkeletons(t,e){const n={},i={};if(e.traverse(function(r){r.isBone&&(i[r.uuid]=r)}),t!==void 0)for(let r=0,a=t.length;r<a;r++){const o=new nc().fromJSON(t[r],i);n[o.uuid]=o}return n}parseGeometries(t,e){const n={};if(t!==void 0){const i=new xm;for(let r=0,a=t.length;r<a;r++){let o;const l=t[r];switch(l.type){case"BufferGeometry":case"InstancedBufferGeometry":o=i.parse(l);break;default:l.type in Wd?o=Wd[l.type].fromJSON(l,e):l.type in ah?o=ah[l.type].fromJSON(l,e):pt(`ObjectLoader: Unknown geometry type "${l.type}". Use .registerGeometry() before starting the deserialization process.`)}o.uuid=l.uuid,l.name!==void 0&&(o.name=l.name),l.userData!==void 0&&(o.userData=l.userData),n[l.uuid]=o}}return n}parseMaterials(t,e){const n={},i={};if(t!==void 0){const r=new Mc;r.setTextures(e);for(let a=0,o=t.length;a<o;a++){const l=t[a];n[l.uuid]===void 0&&(n[l.uuid]=r.parse(l)),i[l.uuid]=n[l.uuid]}}return i}parseAnimations(t){const e={};if(t!==void 0)for(let n=0;n<t.length;n++){const i=t[n],r=Ca.parse(i);e[r.uuid]=r}return e}parseImages(t,e){const n=this,i={};let r;function a(l){return l=n.manager.resolveURL(l),n.manager.itemStart(l),r.load(l,function(){n.manager.itemEnd(l)},void 0,function(){n.manager.itemError(l),n.manager.itemEnd(l)})}function o(l){if(typeof l=="string"){const c=l,h=/^(\/\/)|([a-z]+:(\/\/)?)/i.test(c)?c:n.resourcePath+c;return a(h)}else return l.data?{data:ar(l.type,l.data),width:l.width,height:l.height}:null}if(t!==void 0&&t.length>0){const l=new Eu(e);r=new Ra(l),r.setCrossOrigin(this.crossOrigin);for(let c=0,h=t.length;c<h;c++){const f=t[c],u=f.url;if(Array.isArray(u)){const d=[];for(let p=0,_=u.length;p<_;p++){const g=u[p],m=o(g);m!==null&&(m instanceof HTMLImageElement?d.push(m):d.push(new Nn(m.data,m.width,m.height)))}i[f.uuid]=new Ai(d)}else{const d=o(f.url);i[f.uuid]=new Ai(d)}}}return i}async parseImagesAsync(t){const e=this,n={};let i;async function r(a){if(typeof a=="string"){const o=a,l=/^(\/\/)|([a-z]+:(\/\/)?)/i.test(o)?o:e.resourcePath+o;return await i.loadAsync(l)}else return a.data?{data:ar(a.type,a.data),width:a.width,height:a.height}:null}if(t!==void 0&&t.length>0){i=new Ra(this.manager),i.setCrossOrigin(this.crossOrigin);for(let a=0,o=t.length;a<o;a++){const l=t[a],c=l.url;if(Array.isArray(c)){const h=[];for(let f=0,u=c.length;f<u;f++){const d=c[f],p=await r(d);p!==null&&(p instanceof HTMLImageElement?h.push(p):h.push(new Nn(p.data,p.width,p.height)))}n[l.uuid]=new Ai(h)}else{const h=await r(l.url);n[l.uuid]=new Ai(h)}}}return n}parseTextures(t,e){function n(r,a){return typeof r=="number"?r:(pt("ObjectLoader.parseTexture: Constant should be in numeric form.",r),a[r])}const i={};if(t!==void 0)for(let r=0,a=t.length;r<a;r++){const o=t[r];o.image===void 0&&pt('ObjectLoader: No "image" specified for',o.uuid),e[o.image]===void 0&&pt("ObjectLoader: Undefined image",o.image);const l=e[o.image],c=l.data;let h;Array.isArray(c)?(h=new Fa,c.length===6&&(h.needsUpdate=!0)):(c&&c.data?h=new Nn:h=new Ce,c&&(h.needsUpdate=!0)),h.source=l,h.uuid=o.uuid,o.name!==void 0&&(h.name=o.name),o.mapping!==void 0&&(h.mapping=n(o.mapping,_x)),o.channel!==void 0&&(h.channel=o.channel),o.offset!==void 0&&h.offset.fromArray(o.offset),o.repeat!==void 0&&h.repeat.fromArray(o.repeat),o.center!==void 0&&h.center.fromArray(o.center),o.rotation!==void 0&&(h.rotation=o.rotation),o.wrap!==void 0&&(h.wrapS=n(o.wrap[0],jd),h.wrapT=n(o.wrap[1],jd)),o.format!==void 0&&(h.format=o.format),o.internalFormat!==void 0&&(h.internalFormat=o.internalFormat),o.type!==void 0&&(h.type=o.type),o.colorSpace!==void 0&&(h.colorSpace=o.colorSpace),o.minFilter!==void 0&&(h.minFilter=n(o.minFilter,tf)),o.magFilter!==void 0&&(h.magFilter=n(o.magFilter,tf)),o.anisotropy!==void 0&&(h.anisotropy=o.anisotropy),o.flipY!==void 0&&(h.flipY=o.flipY),o.generateMipmaps!==void 0&&(h.generateMipmaps=o.generateMipmaps),o.premultiplyAlpha!==void 0&&(h.premultiplyAlpha=o.premultiplyAlpha),o.unpackAlignment!==void 0&&(h.unpackAlignment=o.unpackAlignment),o.compareFunction!==void 0&&(h.compareFunction=o.compareFunction),o.normalized!==void 0&&(h.normalized=o.normalized),o.userData!==void 0&&(h.userData=o.userData),i[o.uuid]=h}return i}parseObject(t,e,n,i,r){let a;function o(u){return e[u]===void 0&&pt("ObjectLoader: Undefined geometry",u),e[u]}function l(u){if(u!==void 0){if(Array.isArray(u)){const d=[];for(let p=0,_=u.length;p<_;p++){const g=u[p];n[g]===void 0&&pt("ObjectLoader: Undefined material",g),d.push(n[g])}return d}return n[u]===void 0&&pt("ObjectLoader: Undefined material",u),n[u]}}function c(u){return i[u]===void 0&&pt("ObjectLoader: Undefined texture",u),i[u]}let h,f;switch(t.type){case"Scene":a=new au,t.background!==void 0&&(Number.isInteger(t.background)?a.background=new ut(t.background):a.background=c(t.background)),t.environment!==void 0&&(a.environment=c(t.environment)),t.fog!==void 0&&(t.fog.type==="Fog"?a.fog=new tc(t.fog.color,t.fog.near,t.fog.far):t.fog.type==="FogExp2"&&(a.fog=new Ua(t.fog.color,t.fog.density)),t.fog.name!==""&&(a.fog.name=t.fog.name)),t.backgroundBlurriness!==void 0&&(a.backgroundBlurriness=t.backgroundBlurriness),t.backgroundIntensity!==void 0&&(a.backgroundIntensity=t.backgroundIntensity),t.backgroundRotation!==void 0&&a.backgroundRotation.fromArray(t.backgroundRotation),t.environmentIntensity!==void 0&&(a.environmentIntensity=t.environmentIntensity),t.environmentRotation!==void 0&&a.environmentRotation.fromArray(t.environmentRotation);break;case"PerspectiveCamera":a=new Xe(t.fov,t.aspect,t.near,t.far),t.focus!==void 0&&(a.focus=t.focus),t.zoom!==void 0&&(a.zoom=t.zoom),t.filmGauge!==void 0&&(a.filmGauge=t.filmGauge),t.filmOffset!==void 0&&(a.filmOffset=t.filmOffset),t.view!==void 0&&(a.view=Object.assign({},t.view));break;case"OrthographicCamera":a=new Va(t.left,t.right,t.top,t.bottom,t.near,t.far),t.zoom!==void 0&&(a.zoom=t.zoom),t.view!==void 0&&(a.view=Object.assign({},t.view));break;case"AmbientLight":a=new pm(t.color,t.intensity);break;case"DirectionalLight":a=new Ru(t.color,t.intensity),a.target=t.target||"";break;case"PointLight":a=new fm(t.color,t.intensity,t.distance,t.decay);break;case"RectAreaLight":a=new mm(t.color,t.intensity,t.width,t.height);break;case"SpotLight":a=new dm(t.color,t.intensity,t.distance,t.angle,t.penumbra,t.decay),a.target=t.target||"";break;case"HemisphereLight":a=new Cu(t.color,t.groundColor,t.intensity);break;case"LightProbe":const u=new Iu().fromArray(t.sh);a=new gm(u,t.intensity);break;case"SkinnedMesh":h=o(t.geometry),f=l(t.material),a=new Lp(h,f),t.bindMode!==void 0&&(a.bindMode=t.bindMode),t.bindMatrix!==void 0&&a.bindMatrix.fromArray(t.bindMatrix),t.skeleton!==void 0&&(a.skeleton=t.skeleton);break;case"Mesh":h=o(t.geometry),f=l(t.material),a=new be(h,f);break;case"InstancedMesh":h=o(t.geometry),f=l(t.material);const d=t.count,p=t.instanceMatrix,_=t.instanceColor;a=new Dp(h,f,d),a.instanceMatrix=new _r(new Float32Array(p.array),16),_!==void 0&&(a.instanceColor=new _r(new Float32Array(_.array),_.itemSize));break;case"BatchedMesh":h=o(t.geometry),f=l(t.material),a=new uu(t.maxInstanceCount,t.maxVertexCount,t.maxIndexCount,f),a.geometry=h,a.perObjectFrustumCulled=t.perObjectFrustumCulled,a.sortObjects=t.sortObjects,a._drawRanges=t.drawRanges,a._reservedRanges=t.reservedRanges,a._geometryInfo=t.geometryInfo.map(g=>{let m=null,x=null;return g.boundingBox!==void 0&&(m=new rn().fromJSON(g.boundingBox)),g.boundingSphere!==void 0&&(x=new Ye().fromJSON(g.boundingSphere)),{...g,boundingBox:m,boundingSphere:x}}),a._instanceInfo=t.instanceInfo,a._availableInstanceIds=t._availableInstanceIds,a._availableGeometryIds=t._availableGeometryIds,a._nextIndexStart=t.nextIndexStart,a._nextVertexStart=t.nextVertexStart,a._geometryCount=t.geometryCount,a._maxInstanceCount=t.maxInstanceCount,a._maxVertexCount=t.maxVertexCount,a._maxIndexCount=t.maxIndexCount,a._geometryInitialized=t.geometryInitialized,a._matricesTexture=c(t.matricesTexture.uuid),a._indirectTexture=c(t.indirectTexture.uuid),t.colorsTexture!==void 0&&(a._colorsTexture=c(t.colorsTexture.uuid)),t.boundingSphere!==void 0&&(a.boundingSphere=new Ye().fromJSON(t.boundingSphere)),t.boundingBox!==void 0&&(a.boundingBox=new rn().fromJSON(t.boundingBox));break;case"LOD":a=new Pp;break;case"Line":a=new Qi(o(t.geometry),l(t.material));break;case"LineLoop":a=new Np(o(t.geometry),l(t.material));break;case"LineSegments":a=new di(o(t.geometry),l(t.material));break;case"PointCloud":case"Points":a=new Up(o(t.geometry),l(t.material));break;case"Sprite":a=new Ip(l(t.material));break;case"Group":a=new vn;break;case"Bone":a=new hu;break;default:a=new he}if(a.uuid=t.uuid,t.name!==void 0&&(a.name=t.name),t.matrix!==void 0?(a.matrix.fromArray(t.matrix),t.matrixAutoUpdate!==void 0&&(a.matrixAutoUpdate=t.matrixAutoUpdate),a.matrixAutoUpdate&&a.matrix.decompose(a.position,a.quaternion,a.scale)):(t.position!==void 0&&a.position.fromArray(t.position),t.rotation!==void 0&&a.rotation.fromArray(t.rotation),t.quaternion!==void 0&&a.quaternion.fromArray(t.quaternion),t.scale!==void 0&&a.scale.fromArray(t.scale)),t.up!==void 0&&a.up.fromArray(t.up),t.pivot!==void 0&&(a.pivot=new I().fromArray(t.pivot)),t.morphTargetDictionary!==void 0&&(a.morphTargetDictionary=Object.assign({},t.morphTargetDictionary)),t.morphTargetInfluences!==void 0&&(a.morphTargetInfluences=t.morphTargetInfluences.slice()),t.castShadow!==void 0&&(a.castShadow=t.castShadow),t.receiveShadow!==void 0&&(a.receiveShadow=t.receiveShadow),t.shadow&&(t.shadow.intensity!==void 0&&(a.shadow.intensity=t.shadow.intensity),t.shadow.bias!==void 0&&(a.shadow.bias=t.shadow.bias),t.shadow.normalBias!==void 0&&(a.shadow.normalBias=t.shadow.normalBias),t.shadow.radius!==void 0&&(a.shadow.radius=t.shadow.radius),t.shadow.blurSamples!==void 0&&(a.shadow.blurSamples=t.shadow.blurSamples),t.shadow.focus!==void 0&&(a.shadow.focus=t.shadow.focus),t.shadow.aspect!==void 0&&(a.shadow.aspect=t.shadow.aspect),t.shadow.mapSize!==void 0&&a.shadow.mapSize.fromArray(t.shadow.mapSize),t.shadow.camera!==void 0&&(a.shadow.camera=this.parseObject(t.shadow.camera))),t.visible!==void 0&&(a.visible=t.visible),t.frustumCulled!==void 0&&(a.frustumCulled=t.frustumCulled),t.renderOrder!==void 0&&(a.renderOrder=t.renderOrder),t.static!==void 0&&(a.static=t.static),t.userData!==void 0&&(a.userData=t.userData),t.layers!==void 0&&(a.layers.mask=t.layers),t.children!==void 0){const u=t.children;for(let d=0;d<u.length;d++)a.add(this.parseObject(u[d],e,n,i,r))}if(t.animations!==void 0){const u=t.animations;for(let d=0;d<u.length;d++){const p=u[d];a.animations.push(r[p])}}if(t.type==="LOD"){t.autoUpdate!==void 0&&(a.autoUpdate=t.autoUpdate);const u=t.levels;for(let d=0;d<u.length;d++){const p=u[d],_=a.getObjectByProperty("uuid",p.object);_!==void 0&&a.addLevel(_,p.distance,p.hysteresis)}}return a}bindSkeletons(t,e){Object.keys(e).length!==0&&t.traverse(function(n){if(n.isSkinnedMesh===!0&&n.skeleton!==void 0){const i=e[n.skeleton];i===void 0?pt("ObjectLoader: No skeleton found with UUID:",n.skeleton):n.bind(i,n.bindMatrix)}})}bindLightTargets(t){t.traverse(function(e){if(e.isDirectionalLight||e.isSpotLight){const n=e.target,i=t.getObjectByProperty("uuid",n);i!==void 0?e.target=i:e.target=new he}})}}const _x={UVMapping:kl,CubeReflectionMapping:li,CubeRefractionMapping:$i,EquirectangularReflectionMapping:na,EquirectangularRefractionMapping:ia,CubeUVReflectionMapping:br},jd={RepeatWrapping:pa,ClampToEdgeWrapping:yn,MirroredRepeatWrapping:ma},tf={NearestFilter:Be,NearestMipmapNearestFilter:Jh,NearestMipmapLinearFilter:rr,LinearFilter:Ae,LinearMipmapNearestFilter:sa,LinearMipmapLinearFilter:ri},oh=new WeakMap;class xx extends Sn{constructor(t){super(t),this.isImageBitmapLoader=!0,typeof createImageBitmap>"u"&&pt("ImageBitmapLoader: createImageBitmap() not supported."),typeof fetch>"u"&&pt("ImageBitmapLoader: fetch() not supported."),this.options={premultiplyAlpha:"none"},this._abortController=new AbortController}setOptions(t){return this.options=t,this}load(t,e,n,i){t===void 0&&(t=""),this.path!==void 0&&(t=this.path+t),t=this.manager.resolveURL(t);const r=this,a=ai.get(`image-bitmap:${t}`);if(a!==void 0){if(r.manager.itemStart(t),a.then){a.then(c=>{oh.has(a)===!0?(i&&i(oh.get(a)),r.manager.itemError(t),r.manager.itemEnd(t)):(e&&e(c),r.manager.itemEnd(t))});return}setTimeout(function(){e&&e(a),r.manager.itemEnd(t)},0);return}const o={};o.credentials=this.crossOrigin==="anonymous"?"same-origin":"include",o.headers=this.requestHeader,o.signal=typeof AbortSignal.any=="function"?AbortSignal.any([this._abortController.signal,this.manager.abortController.signal]):this._abortController.signal;const l=fetch(t,o).then(function(c){return c.blob()}).then(function(c){return createImageBitmap(c,Object.assign({},r.options,{colorSpaceConversion:"none"}))}).then(function(c){return ai.add(`image-bitmap:${t}`,c),e&&e(c),r.manager.itemEnd(t),c}).catch(function(c){i&&i(c),oh.set(l,c),ai.remove(`image-bitmap:${t}`),r.manager.itemError(t),r.manager.itemEnd(t)});ai.add(`image-bitmap:${t}`,l),r.manager.itemStart(t)}abort(){return this._abortController.abort(),this._abortController=new AbortController,this}}let Eo;class Pu{static getContext(){return Eo===void 0&&(Eo=new(window.AudioContext||window.webkitAudioContext)),Eo}static setContext(t){Eo=t}}class yx extends Sn{constructor(t){super(t)}load(t,e,n,i){const r=this,a=new Li(this.manager);a.setResponseType("arraybuffer"),a.setPath(this.path),a.setRequestHeader(this.requestHeader),a.setWithCredentials(this.withCredentials),a.load(t,function(l){try{const c=l.slice(0),h=Pu.getContext(),f=t+"#decode";r.manager.itemStart(f),h.decodeAudioData(c,function(u){e(u),r.manager.itemEnd(f)}).catch(function(u){o(u),r.manager.itemEnd(f)})}catch(c){o(c)}},n,i);function o(l){i?i(l):Nt(l),r.manager.itemError(t)}}}const ef=new Yt,nf=new Yt,hs=new Yt;class vx{constructor(){this.type="StereoCamera",this.aspect=1,this.eyeSep=.064,this.cameraL=new Xe,this.cameraL.layers.enable(1),this.cameraL.matrixAutoUpdate=!1,this.cameraR=new Xe,this.cameraR.layers.enable(2),this.cameraR.matrixAutoUpdate=!1,this._cache={focus:null,fov:null,aspect:null,near:null,far:null,zoom:null,eyeSep:null}}update(t){const e=this._cache;if(e.focus!==t.focus||e.fov!==t.fov||e.aspect!==t.aspect*this.aspect||e.near!==t.near||e.far!==t.far||e.zoom!==t.zoom||e.eyeSep!==this.eyeSep){e.focus=t.focus,e.fov=t.fov,e.aspect=t.aspect*this.aspect,e.near=t.near,e.far=t.far,e.zoom=t.zoom,e.eyeSep=this.eyeSep,hs.copy(t.projectionMatrix);const i=e.eyeSep/2,r=i*e.near/e.focus,a=e.near*Math.tan(Ss*e.fov*.5)/e.zoom;let o,l;nf.elements[12]=-i,ef.elements[12]=i,o=-a*e.aspect+r,l=a*e.aspect+r,hs.elements[0]=2*e.near/(l-o),hs.elements[8]=(l+o)/(l-o),this.cameraL.projectionMatrix.copy(hs),o=-a*e.aspect-r,l=a*e.aspect-r,hs.elements[0]=2*e.near/(l-o),hs.elements[8]=(l+o)/(l-o),this.cameraR.projectionMatrix.copy(hs)}this.cameraL.matrix.copy(t.matrixWorld).multiply(nf),this.cameraL.matrixWorldNeedsUpdate=!0,this.cameraR.matrix.copy(t.matrixWorld).multiply(ef),this.cameraR.matrixWorldNeedsUpdate=!0}}const Qs=-90,js=1;class ym extends he{constructor(t,e,n){super(),this.type="CubeCamera",this.renderTarget=n,this.coordinateSystem=null,this.activeMipmapLevel=0;const i=new Xe(Qs,js,t,e);i.layers=this.layers,this.add(i);const r=new Xe(Qs,js,t,e);r.layers=this.layers,this.add(r);const a=new Xe(Qs,js,t,e);a.layers=this.layers,this.add(a);const o=new Xe(Qs,js,t,e);o.layers=this.layers,this.add(o);const l=new Xe(Qs,js,t,e);l.layers=this.layers,this.add(l);const c=new Xe(Qs,js,t,e);c.layers=this.layers,this.add(c)}updateCoordinateSystem(){const t=this.coordinateSystem,e=this.children.concat(),[n,i,r,a,o,l]=e;for(const c of e)this.remove(c);if(t===En)n.up.set(0,1,0),n.lookAt(1,0,0),i.up.set(0,1,0),i.lookAt(-1,0,0),r.up.set(0,0,-1),r.lookAt(0,1,0),a.up.set(0,0,1),a.lookAt(0,-1,0),o.up.set(0,1,0),o.lookAt(0,0,1),l.up.set(0,1,0),l.lookAt(0,0,-1);else if(t===As)n.up.set(0,-1,0),n.lookAt(-1,0,0),i.up.set(0,-1,0),i.lookAt(1,0,0),r.up.set(0,0,1),r.lookAt(0,1,0),a.up.set(0,0,-1),a.lookAt(0,-1,0),o.up.set(0,-1,0),o.lookAt(0,0,1),l.up.set(0,-1,0),l.lookAt(0,0,-1);else throw new Error("THREE.CubeCamera.updateCoordinateSystem(): Invalid coordinate system: "+t);for(const c of e)this.add(c),c.updateMatrixWorld()}update(t,e){this.parent===null&&this.updateMatrixWorld();const{renderTarget:n,activeMipmapLevel:i}=this;this.coordinateSystem!==t.coordinateSystem&&(this.coordinateSystem=t.coordinateSystem,this.updateCoordinateSystem());const[r,a,o,l,c,h]=this.children,f=t.getRenderTarget(),u=t.getActiveCubeFace(),d=t.getActiveMipmapLevel(),p=t.xr.enabled;t.xr.enabled=!1;const _=n.texture.generateMipmaps;n.texture.generateMipmaps=!1;let g=!1;t.isWebGLRenderer===!0?g=t.state.buffers.depth.getReversed():g=t.reversedDepthBuffer,t.setRenderTarget(n,0,i),g&&t.autoClear===!1&&t.clearDepth(),t.render(e,r),t.setRenderTarget(n,1,i),g&&t.autoClear===!1&&t.clearDepth(),t.render(e,a),t.setRenderTarget(n,2,i),g&&t.autoClear===!1&&t.clearDepth(),t.render(e,o),t.setRenderTarget(n,3,i),g&&t.autoClear===!1&&t.clearDepth(),t.render(e,l),t.setRenderTarget(n,4,i),g&&t.autoClear===!1&&t.clearDepth(),t.render(e,c),n.texture.generateMipmaps=_,t.setRenderTarget(n,5,i),g&&t.autoClear===!1&&t.clearDepth(),t.render(e,h),t.setRenderTarget(f,u,d),t.xr.enabled=p,n.texture.needsPMREMUpdate=!0}}class vm extends Xe{constructor(t=[]){super(),this.isArrayCamera=!0,this.isMultiViewCamera=!1,this.cameras=t}}class Mm{constructor(){this._previousTime=0,this._currentTime=0,this._startTime=performance.now(),this._delta=0,this._elapsed=0,this._timescale=1,this._document=null,this._pageVisibilityHandler=null}connect(t){this._document=t,t.hidden!==void 0&&(this._pageVisibilityHandler=Mx.bind(this),t.addEventListener("visibilitychange",this._pageVisibilityHandler,!1))}disconnect(){this._pageVisibilityHandler!==null&&(this._document.removeEventListener("visibilitychange",this._pageVisibilityHandler),this._pageVisibilityHandler=null),this._document=null}getDelta(){return this._delta/1e3}getElapsed(){return this._elapsed/1e3}getTimescale(){return this._timescale}setTimescale(t){return this._timescale=t,this}reset(){return this._currentTime=performance.now()-this._startTime,this}dispose(){this.disconnect()}update(t){return this._pageVisibilityHandler!==null&&this._document.hidden===!0?this._delta=0:(this._previousTime=this._currentTime,this._currentTime=(t!==void 0?t:performance.now())-this._startTime,this._delta=(this._currentTime-this._previousTime)*this._timescale,this._elapsed+=this._delta),this}}function Mx(){this._document.hidden===!1&&this.reset()}const us=new I,lh=new sn,Sx=new I,ds=new I,fs=new I;class bx extends he{constructor(){super(),this.type="AudioListener",this.context=Pu.getContext(),this.gain=this.context.createGain(),this.gain.connect(this.context.destination),this.filter=null,this.timeDelta=0,this._timer=new Mm}getInput(){return this.gain}removeFilter(){return this.filter!==null&&(this.gain.disconnect(this.filter),this.filter.disconnect(this.context.destination),this.gain.connect(this.context.destination),this.filter=null),this}getFilter(){return this.filter}setFilter(t){return this.filter!==null?(this.gain.disconnect(this.filter),this.filter.disconnect(this.context.destination)):this.gain.disconnect(this.context.destination),this.filter=t,this.gain.connect(this.filter),this.filter.connect(this.context.destination),this}getMasterVolume(){return this.gain.gain.value}setMasterVolume(t){return this.gain.gain.setTargetAtTime(t,this.context.currentTime,.01),this}updateMatrixWorld(t){super.updateMatrixWorld(t),this._timer.update();const e=this.context.listener;if(this.timeDelta=this._timer.getDelta(),this.matrixWorld.decompose(us,lh,Sx),ds.set(0,0,-1).applyQuaternion(lh),fs.set(0,1,0).applyQuaternion(lh),e.positionX){const n=this.context.currentTime+this.timeDelta;e.positionX.linearRampToValueAtTime(us.x,n),e.positionY.linearRampToValueAtTime(us.y,n),e.positionZ.linearRampToValueAtTime(us.z,n),e.forwardX.linearRampToValueAtTime(ds.x,n),e.forwardY.linearRampToValueAtTime(ds.y,n),e.forwardZ.linearRampToValueAtTime(ds.z,n),e.upX.linearRampToValueAtTime(fs.x,n),e.upY.linearRampToValueAtTime(fs.y,n),e.upZ.linearRampToValueAtTime(fs.z,n)}else e.setPosition(us.x,us.y,us.z),e.setOrientation(ds.x,ds.y,ds.z,fs.x,fs.y,fs.z)}}class Sm extends he{constructor(t){super(),this.type="Audio",this.listener=t,this.context=t.context,this.gain=this.context.createGain(),this.gain.connect(t.getInput()),this.autoplay=!1,this.buffer=null,this.detune=0,this.loop=!1,this.loopStart=0,this.loopEnd=0,this.offset=0,this.duration=void 0,this.playbackRate=1,this.isPlaying=!1,this.hasPlaybackControl=!0,this.source=null,this.sourceType="empty",this._startedAt=0,this._progress=0,this._connected=!1,this.filters=[]}getOutput(){return this.gain}setNodeSource(t){return this.hasPlaybackControl=!1,this.sourceType="audioNode",this.source=t,this.connect(),this}setMediaElementSource(t){return this.hasPlaybackControl=!1,this.sourceType="mediaNode",this.source=this.context.createMediaElementSource(t),this.connect(),this}setMediaStreamSource(t){return this.hasPlaybackControl=!1,this.sourceType="mediaStreamNode",this.source=this.context.createMediaStreamSource(t),this.connect(),this}setBuffer(t){return this.buffer=t,this.sourceType="buffer",this.autoplay&&this.play(),this}play(t=0){if(this.isPlaying===!0){pt("Audio: Audio is already playing.");return}if(this.hasPlaybackControl===!1){pt("Audio: this Audio has no playback control.");return}this._startedAt=this.context.currentTime+t;const e=this.context.createBufferSource();return e.buffer=this.buffer,e.loop=this.loop,e.loopStart=this.loopStart,e.loopEnd=this.loopEnd,e.onended=this.onEnded.bind(this),e.start(this._startedAt,this._progress+this.offset,this.duration),this.isPlaying=!0,this.source=e,this.setDetune(this.detune),this.setPlaybackRate(this.playbackRate),this.connect()}pause(){if(this.hasPlaybackControl===!1){pt("Audio: this Audio has no playback control.");return}return this.isPlaying===!0&&(this._progress+=Math.max(this.context.currentTime-this._startedAt,0)*this.playbackRate,this.loop===!0&&(this._progress=this._progress%(this.duration||this.buffer.duration)),this.source.stop(),this.source.onended=null,this.isPlaying=!1),this}stop(t=0){if(this.hasPlaybackControl===!1){pt("Audio: this Audio has no playback control.");return}return this._progress=0,this.source!==null&&(this.source.stop(this.context.currentTime+t),this.source.onended=null),this.isPlaying=!1,this}connect(){if(this.filters.length>0){this.source.connect(this.filters[0]);for(let t=1,e=this.filters.length;t<e;t++)this.filters[t-1].connect(this.filters[t]);this.filters[this.filters.length-1].connect(this.getOutput())}else this.source.connect(this.getOutput());return this._connected=!0,this}disconnect(){if(this._connected!==!1){if(this.filters.length>0){this.source.disconnect(this.filters[0]);for(let t=1,e=this.filters.length;t<e;t++)this.filters[t-1].disconnect(this.filters[t]);this.filters[this.filters.length-1].disconnect(this.getOutput())}else this.source.disconnect(this.getOutput());return this._connected=!1,this}}getFilters(){return this.filters}setFilters(t){return t||(t=[]),this._connected===!0?(this.disconnect(),this.filters=t.slice(),this.connect()):this.filters=t.slice(),this}setDetune(t){return this.detune=t,this.isPlaying===!0&&this.source.detune!==void 0&&this.source.detune.setTargetAtTime(this.detune,this.context.currentTime,.01),this}getDetune(){return this.detune}getFilter(){return this.getFilters()[0]}setFilter(t){return this.setFilters(t?[t]:[])}setPlaybackRate(t){if(this.hasPlaybackControl===!1){pt("Audio: this Audio has no playback control.");return}return this.playbackRate=t,this.isPlaying===!0&&this.source.playbackRate.setTargetAtTime(this.playbackRate,this.context.currentTime,.01),this}getPlaybackRate(){return this.playbackRate}onEnded(){this.isPlaying=!1,this._progress=0}getLoop(){return this.hasPlaybackControl===!1?(pt("Audio: this Audio has no playback control."),!1):this.loop}setLoop(t){if(this.hasPlaybackControl===!1){pt("Audio: this Audio has no playback control.");return}return this.loop=t,this.isPlaying===!0&&(this.source.loop=this.loop),this}setLoopStart(t){return this.loopStart=t,this}setLoopEnd(t){return this.loopEnd=t,this}getVolume(){return this.gain.gain.value}setVolume(t){return this.gain.gain.setTargetAtTime(t,this.context.currentTime,.01),this}copy(t,e){return super.copy(t,e),t.sourceType!=="buffer"?(pt("Audio: Audio source type cannot be copied."),this):(this.autoplay=t.autoplay,this.buffer=t.buffer,this.detune=t.detune,this.loop=t.loop,this.loopStart=t.loopStart,this.loopEnd=t.loopEnd,this.offset=t.offset,this.duration=t.duration,this.playbackRate=t.playbackRate,this.hasPlaybackControl=t.hasPlaybackControl,this.sourceType=t.sourceType,this.filters=t.filters.slice(),this)}clone(t){return new this.constructor(this.listener).copy(this,t)}}const ps=new I,sf=new sn,wx=new I,ms=new I;class Ax extends Sm{constructor(t){super(t),this.panner=this.context.createPanner(),this.panner.panningModel="HRTF",this.panner.connect(this.gain)}connect(){return super.connect(),this.panner.connect(this.gain),this}disconnect(){return super.disconnect(),this.panner.disconnect(this.gain),this}getOutput(){return this.panner}getRefDistance(){return this.panner.refDistance}setRefDistance(t){return this.panner.refDistance=t,this}getRolloffFactor(){return this.panner.rolloffFactor}setRolloffFactor(t){return this.panner.rolloffFactor=t,this}getDistanceModel(){return this.panner.distanceModel}setDistanceModel(t){return this.panner.distanceModel=t,this}getMaxDistance(){return this.panner.maxDistance}setMaxDistance(t){return this.panner.maxDistance=t,this}setDirectionalCone(t,e,n){return this.panner.coneInnerAngle=t,this.panner.coneOuterAngle=e,this.panner.coneOuterGain=n,this}updateMatrixWorld(t){if(super.updateMatrixWorld(t),this.hasPlaybackControl===!0&&this.isPlaying===!1)return;this.matrixWorld.decompose(ps,sf,wx),ms.set(0,0,1).applyQuaternion(sf);const e=this.panner;if(e.positionX){const n=this.context.currentTime+this.listener.timeDelta;e.positionX.linearRampToValueAtTime(ps.x,n),e.positionY.linearRampToValueAtTime(ps.y,n),e.positionZ.linearRampToValueAtTime(ps.z,n),e.orientationX.linearRampToValueAtTime(ms.x,n),e.orientationY.linearRampToValueAtTime(ms.y,n),e.orientationZ.linearRampToValueAtTime(ms.z,n)}else e.setPosition(ps.x,ps.y,ps.z),e.setOrientation(ms.x,ms.y,ms.z)}}class Tx{constructor(t,e=2048){this.analyser=t.context.createAnalyser(),this.analyser.fftSize=e,this.data=new Uint8Array(this.analyser.frequencyBinCount),t.getOutput().connect(this.analyser)}getFrequencyData(){return this.analyser.getByteFrequencyData(this.data),this.data}getAverageFrequency(){let t=0;const e=this.getFrequencyData();for(let n=0;n<e.length;n++)t+=e[n];return t/e.length}}class bm{constructor(t,e,n){this.binding=t,this.valueSize=n;let i,r,a;switch(e){case"quaternion":i=this._slerp,r=this._slerpAdditive,a=this._setAdditiveIdentityQuaternion,this.buffer=new Float64Array(n*6),this._workIndex=5;break;case"string":case"bool":i=this._select,r=this._select,a=this._setAdditiveIdentityOther,this.buffer=new Array(n*5);break;default:i=this._lerp,r=this._lerpAdditive,a=this._setAdditiveIdentityNumeric,this.buffer=new Float64Array(n*5)}this._mixBufferRegion=i,this._mixBufferRegionAdditive=r,this._setIdentity=a,this._origIndex=3,this._addIndex=4,this.cumulativeWeight=0,this.cumulativeWeightAdditive=0,this.useCount=0,this.referenceCount=0}accumulate(t,e){const n=this.buffer,i=this.valueSize,r=t*i+i;let a=this.cumulativeWeight;if(a===0){for(let o=0;o!==i;++o)n[r+o]=n[o];a=e}else{a+=e;const o=e/a;this._mixBufferRegion(n,r,0,o,i)}this.cumulativeWeight=a}accumulateAdditive(t){const e=this.buffer,n=this.valueSize,i=n*this._addIndex;this.cumulativeWeightAdditive===0&&this._setIdentity(),this._mixBufferRegionAdditive(e,i,0,t,n),this.cumulativeWeightAdditive+=t}apply(t){const e=this.valueSize,n=this.buffer,i=t*e+e,r=this.cumulativeWeight,a=this.cumulativeWeightAdditive,o=this.binding;if(this.cumulativeWeight=0,this.cumulativeWeightAdditive=0,r<1){const l=e*this._origIndex;this._mixBufferRegion(n,i,l,1-r,e)}a>0&&this._mixBufferRegionAdditive(n,i,this._addIndex*e,1,e);for(let l=e,c=e+e;l!==c;++l)if(n[l]!==n[l+e]){o.setValue(n,i);break}}saveOriginalState(){const t=this.binding,e=this.buffer,n=this.valueSize,i=n*this._origIndex;t.getValue(e,i);for(let r=n,a=i;r!==a;++r)e[r]=e[i+r%n];this._setIdentity(),this.cumulativeWeight=0,this.cumulativeWeightAdditive=0}restoreOriginalState(){const t=this.valueSize*3;this.binding.setValue(this.buffer,t)}_setAdditiveIdentityNumeric(){const t=this._addIndex*this.valueSize,e=t+this.valueSize;for(let n=t;n<e;n++)this.buffer[n]=0}_setAdditiveIdentityQuaternion(){this._setAdditiveIdentityNumeric(),this.buffer[this._addIndex*this.valueSize+3]=1}_setAdditiveIdentityOther(){const t=this._origIndex*this.valueSize,e=this._addIndex*this.valueSize;for(let n=0;n<this.valueSize;n++)this.buffer[e+n]=this.buffer[t+n]}_select(t,e,n,i,r){if(i>=.5)for(let a=0;a!==r;++a)t[e+a]=t[n+a]}_slerp(t,e,n,i){sn.slerpFlat(t,e,t,e,t,n,i)}_slerpAdditive(t,e,n,i,r){const a=this._workIndex*r;sn.multiplyQuaternionsFlat(t,a,t,e,t,n),sn.slerpFlat(t,e,t,e,t,a,i)}_lerp(t,e,n,i,r){const a=1-i;for(let o=0;o!==r;++o){const l=e+o;t[l]=t[l]*a+t[n+o]*i}}_lerpAdditive(t,e,n,i,r){for(let a=0;a!==r;++a){const o=e+a;t[o]=t[o]+t[n+a]*i}}}const Lu="\\[\\]\\.:\\/",Ex=new RegExp("["+Lu+"]","g"),Du="[^"+Lu+"]",Cx="[^"+Lu.replace("\\.","")+"]",Rx=/((?:WC+[\/:])*)/.source.replace("WC",Du),Ix=/(WCOD+)?/.source.replace("WCOD",Cx),Px=/(?:\.(WC+)(?:\[(.+)\])?)?/.source.replace("WC",Du),Lx=/\.(WC+)(?:\[(.+)\])?/.source.replace("WC",Du),Dx=new RegExp("^"+Rx+Ix+Px+Lx+"$"),Nx=["material","materials","bones","map"];class Ux{constructor(t,e,n){const i=n||le.parseTrackName(e);this._targetGroup=t,this._bindings=t.subscribe_(e,i)}getValue(t,e){this.bind();const n=this._targetGroup.nCachedObjects_,i=this._bindings[n];i!==void 0&&i.getValue(t,e)}setValue(t,e){const n=this._bindings;for(let i=this._targetGroup.nCachedObjects_,r=n.length;i!==r;++i)n[i].setValue(t,e)}bind(){const t=this._bindings;for(let e=this._targetGroup.nCachedObjects_,n=t.length;e!==n;++e)t[e].bind()}unbind(){const t=this._bindings;for(let e=this._targetGroup.nCachedObjects_,n=t.length;e!==n;++e)t[e].unbind()}}class le{constructor(t,e,n){this.path=e,this.parsedPath=n||le.parseTrackName(e),this.node=le.findNode(t,this.parsedPath.nodeName),this.rootNode=t,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}static create(t,e,n){return t&&t.isAnimationObjectGroup?new le.Composite(t,e,n):new le(t,e,n)}static sanitizeNodeName(t){return t.replace(/\s/g,"_").replace(Ex,"")}static parseTrackName(t){const e=Dx.exec(t);if(e===null)throw new Error("THREE.PropertyBinding: Cannot parse trackName: "+t);const n={nodeName:e[2],objectName:e[3],objectIndex:e[4],propertyName:e[5],propertyIndex:e[6]},i=n.nodeName&&n.nodeName.lastIndexOf(".");if(i!==void 0&&i!==-1){const r=n.nodeName.substring(i+1);Nx.indexOf(r)!==-1&&(n.nodeName=n.nodeName.substring(0,i),n.objectName=r)}if(n.propertyName===null||n.propertyName.length===0)throw new Error("THREE.PropertyBinding: can not parse propertyName from trackName: "+t);return n}static findNode(t,e){if(e===void 0||e===""||e==="."||e===-1||e===t.name||e===t.uuid)return t;if(t.skeleton){const n=t.skeleton.getBoneByName(e);if(n!==void 0)return n}if(t.children){const n=function(r){for(let a=0;a<r.length;a++){const o=r[a];if(o.name===e||o.uuid===e)return o;const l=n(o.children);if(l)return l}return null},i=n(t.children);if(i)return i}return null}_getValue_unavailable(){}_setValue_unavailable(){}_getValue_direct(t,e){t[e]=this.targetObject[this.propertyName]}_getValue_array(t,e){const n=this.resolvedProperty;for(let i=0,r=n.length;i!==r;++i)t[e++]=n[i]}_getValue_arrayElement(t,e){t[e]=this.resolvedProperty[this.propertyIndex]}_getValue_toArray(t,e){this.resolvedProperty.toArray(t,e)}_setValue_direct(t,e){this.targetObject[this.propertyName]=t[e]}_setValue_direct_setNeedsUpdate(t,e){this.targetObject[this.propertyName]=t[e],this.targetObject.needsUpdate=!0}_setValue_direct_setMatrixWorldNeedsUpdate(t,e){this.targetObject[this.propertyName]=t[e],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_array(t,e){const n=this.resolvedProperty;for(let i=0,r=n.length;i!==r;++i)n[i]=t[e++]}_setValue_array_setNeedsUpdate(t,e){const n=this.resolvedProperty;for(let i=0,r=n.length;i!==r;++i)n[i]=t[e++];this.targetObject.needsUpdate=!0}_setValue_array_setMatrixWorldNeedsUpdate(t,e){const n=this.resolvedProperty;for(let i=0,r=n.length;i!==r;++i)n[i]=t[e++];this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_arrayElement(t,e){this.resolvedProperty[this.propertyIndex]=t[e]}_setValue_arrayElement_setNeedsUpdate(t,e){this.resolvedProperty[this.propertyIndex]=t[e],this.targetObject.needsUpdate=!0}_setValue_arrayElement_setMatrixWorldNeedsUpdate(t,e){this.resolvedProperty[this.propertyIndex]=t[e],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_fromArray(t,e){this.resolvedProperty.fromArray(t,e)}_setValue_fromArray_setNeedsUpdate(t,e){this.resolvedProperty.fromArray(t,e),this.targetObject.needsUpdate=!0}_setValue_fromArray_setMatrixWorldNeedsUpdate(t,e){this.resolvedProperty.fromArray(t,e),this.targetObject.matrixWorldNeedsUpdate=!0}_getValue_unbound(t,e){this.bind(),this.getValue(t,e)}_setValue_unbound(t,e){this.bind(),this.setValue(t,e)}bind(){let t=this.node;const e=this.parsedPath,n=e.objectName,i=e.propertyName;let r=e.propertyIndex;if(t||(t=le.findNode(this.rootNode,e.nodeName),this.node=t),this.getValue=this._getValue_unavailable,this.setValue=this._setValue_unavailable,!t){pt("PropertyBinding: No target node found for track: "+this.path+".");return}if(n){let c=e.objectIndex;switch(n){case"materials":if(!t.material){Nt("PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!t.material.materials){Nt("PropertyBinding: Can not bind to material.materials as node.material does not have a materials array.",this);return}t=t.material.materials;break;case"bones":if(!t.skeleton){Nt("PropertyBinding: Can not bind to bones as node does not have a skeleton.",this);return}t=t.skeleton.bones;for(let h=0;h<t.length;h++)if(t[h].name===c){c=h;break}break;case"map":if("map"in t){t=t.map;break}if(!t.material){Nt("PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!t.material.map){Nt("PropertyBinding: Can not bind to material.map as node.material does not have a map.",this);return}t=t.material.map;break;default:if(t[n]===void 0){Nt("PropertyBinding: Can not bind to objectName of node undefined.",this);return}t=t[n]}if(c!==void 0){if(t[c]===void 0){Nt("PropertyBinding: Trying to bind to objectIndex of objectName, but is undefined.",this,t);return}t=t[c]}}const a=t[i];if(a===void 0){const c=e.nodeName;Nt("PropertyBinding: Trying to update property for track: "+c+"."+i+" but it wasn't found.",t);return}let o=this.Versioning.None;this.targetObject=t,t.isMaterial===!0?o=this.Versioning.NeedsUpdate:t.isObject3D===!0&&(o=this.Versioning.MatrixWorldNeedsUpdate);let l=this.BindingType.Direct;if(r!==void 0){if(i==="morphTargetInfluences"){if(!t.geometry){Nt("PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.",this);return}if(!t.geometry.morphAttributes){Nt("PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.morphAttributes.",this);return}t.morphTargetDictionary[r]!==void 0&&(r=t.morphTargetDictionary[r])}l=this.BindingType.ArrayElement,this.resolvedProperty=a,this.propertyIndex=r}else a.fromArray!==void 0&&a.toArray!==void 0?(l=this.BindingType.HasFromToArray,this.resolvedProperty=a):Array.isArray(a)?(l=this.BindingType.EntireArray,this.resolvedProperty=a):this.propertyName=i;this.getValue=this.GetterByBindingType[l],this.setValue=this.SetterByBindingTypeAndVersioning[l][o]}unbind(){this.node=null,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}}le.Composite=Ux;le.prototype.BindingType={Direct:0,EntireArray:1,ArrayElement:2,HasFromToArray:3};le.prototype.Versioning={None:0,NeedsUpdate:1,MatrixWorldNeedsUpdate:2};le.prototype.GetterByBindingType=[le.prototype._getValue_direct,le.prototype._getValue_array,le.prototype._getValue_arrayElement,le.prototype._getValue_toArray];le.prototype.SetterByBindingTypeAndVersioning=[[le.prototype._setValue_direct,le.prototype._setValue_direct_setNeedsUpdate,le.prototype._setValue_direct_setMatrixWorldNeedsUpdate],[le.prototype._setValue_array,le.prototype._setValue_array_setNeedsUpdate,le.prototype._setValue_array_setMatrixWorldNeedsUpdate],[le.prototype._setValue_arrayElement,le.prototype._setValue_arrayElement_setNeedsUpdate,le.prototype._setValue_arrayElement_setMatrixWorldNeedsUpdate],[le.prototype._setValue_fromArray,le.prototype._setValue_fromArray_setNeedsUpdate,le.prototype._setValue_fromArray_setMatrixWorldNeedsUpdate]];class Fx{constructor(){this.isAnimationObjectGroup=!0,this.uuid=Cn(),this._objects=Array.prototype.slice.call(arguments),this.nCachedObjects_=0;const t={};this._indicesByUUID=t;for(let n=0,i=arguments.length;n!==i;++n)t[arguments[n].uuid]=n;this._paths=[],this._parsedPaths=[],this._bindings=[],this._bindingsIndicesByPath={};const e=this;this.stats={objects:{get total(){return e._objects.length},get inUse(){return this.total-e.nCachedObjects_}},get bindingsPerObject(){return e._bindings.length}}}add(){const t=this._objects,e=this._indicesByUUID,n=this._paths,i=this._parsedPaths,r=this._bindings,a=r.length;let o,l=t.length,c=this.nCachedObjects_;for(let h=0,f=arguments.length;h!==f;++h){const u=arguments[h],d=u.uuid;let p=e[d];if(p===void 0){p=l++,e[d]=p,t.push(u);for(let _=0,g=a;_!==g;++_)r[_].push(new le(u,n[_],i[_]))}else if(p<c){o=t[p];const _=--c,g=t[_];e[g.uuid]=p,t[p]=g,e[d]=_,t[_]=u;for(let m=0,x=a;m!==x;++m){const M=r[m],y=M[_];let w=M[p];M[p]=y,w===void 0&&(w=new le(u,n[m],i[m])),M[_]=w}}else t[p]!==o&&Nt("AnimationObjectGroup: Different objects with the same UUID detected. Clean the caches or recreate your infrastructure when reloading scenes.")}this.nCachedObjects_=c}remove(){const t=this._objects,e=this._indicesByUUID,n=this._bindings,i=n.length;let r=this.nCachedObjects_;for(let a=0,o=arguments.length;a!==o;++a){const l=arguments[a],c=l.uuid,h=e[c];if(h!==void 0&&h>=r){const f=r++,u=t[f];e[u.uuid]=h,t[h]=u,e[c]=f,t[f]=l;for(let d=0,p=i;d!==p;++d){const _=n[d],g=_[f],m=_[h];_[h]=g,_[f]=m}}}this.nCachedObjects_=r}uncache(){const t=this._objects,e=this._indicesByUUID,n=this._bindings,i=n.length;let r=this.nCachedObjects_,a=t.length;for(let o=0,l=arguments.length;o!==l;++o){const c=arguments[o],h=c.uuid,f=e[h];if(f!==void 0)if(delete e[h],f<r){const u=--r,d=t[u],p=--a,_=t[p];f!==u&&(e[d.uuid]=f),t[f]=d,u!==p&&(e[_.uuid]=u),t[u]=_,t.pop();for(let g=0,m=i;g!==m;++g){const x=n[g],M=x[u],y=x[p];x[f]=M,x[u]=y,x.pop()}}else{const u=--a,d=t[u];f!==u&&(e[d.uuid]=f),t[f]=d,t.pop();for(let p=0,_=i;p!==_;++p){const g=n[p];g[f]=g[u],g.pop()}}}this.nCachedObjects_=r}subscribe_(t,e){const n=this._bindingsIndicesByPath;let i=n[t];const r=this._bindings;if(i!==void 0)return r[i];const a=this._paths,o=this._parsedPaths,l=this._objects,c=l.length,h=this.nCachedObjects_,f=new Array(c);i=r.length,n[t]=i,a.push(t),o.push(e),r.push(f);for(let u=h,d=l.length;u!==d;++u){const p=l[u];f[u]=new le(p,t,e)}return f}unsubscribe_(t){const e=this._bindingsIndicesByPath,n=e[t];if(n!==void 0){const i=this._paths,r=this._parsedPaths,a=this._bindings,o=a.length-1,l=a[o],c=i[o];e[c]=n,a[n]=l,a.pop(),r[n]=r[o],r.pop(),i[n]=i[o],i.pop()}}}class wm{constructor(t,e,n=null,i=e.blendMode){this._mixer=t,this._clip=e,this._localRoot=n,this.blendMode=i;const r=e.tracks,a=r.length,o=new Array(a),l={endingStart:ys,endingEnd:ys};for(let c=0;c!==a;++c){const h=r[c].createInterpolant(null);o[c]=h,h.settings=l}this._interpolantSettings=l,this._interpolants=o,this._propertyBindings=new Array(a),this._cacheIndex=null,this._byClipCacheIndex=null,this._timeScaleInterpolant=null,this._restoreTimeScale=null,this._weightInterpolant=null,this.loop=fp,this._loopCount=-1,this._startTime=null,this.time=0,this.timeScale=1,this._effectiveTimeScale=1,this.weight=1,this._effectiveWeight=1,this.repetitions=1/0,this.paused=!1,this.enabled=!0,this.clampWhenFinished=!1,this.zeroSlopeAtStart=!0,this.zeroSlopeAtEnd=!0}play(){return this._mixer._activateAction(this),this}stop(){return this._mixer._deactivateAction(this),this.reset()}reset(){return this.paused=!1,this.enabled=!0,this.time=0,this._loopCount=-1,this._startTime=null,this.stopFading().stopWarping()}isRunning(){return this.enabled&&!this.paused&&this.timeScale!==0&&this._startTime===null&&this._mixer._isActiveAction(this)}isScheduled(){return this._mixer._isActiveAction(this)}startAt(t){return this._startTime=t,this}setLoop(t,e){return this.loop=t,this.repetitions=e,this}setEffectiveWeight(t){return this.weight=t,this._effectiveWeight=this.enabled?t:0,this.stopFading()}getEffectiveWeight(){return this._effectiveWeight}fadeIn(t){return this._scheduleFading(t,0,1)}fadeOut(t){return this._scheduleFading(t,1,0)}crossFadeFrom(t,e,n=!1){if(t.fadeOut(e),this.fadeIn(e),n===!0){const i=this._clip.duration,r=t._clip.duration,a=r/i,o=i/r;t._restoreTimeScale=t.timeScale,this._restoreTimeScale=this.timeScale,t.warp(1,a,e),this.warp(o,1,e)}return this}crossFadeTo(t,e,n=!1){return t.crossFadeFrom(this,e,n)}stopFading(){const t=this._weightInterpolant;return t!==null&&(this._weightInterpolant=null,this._mixer._takeBackControlInterpolant(t)),this}setEffectiveTimeScale(t){return this.timeScale=t,this._effectiveTimeScale=this.paused?0:t,this.stopWarping()}getEffectiveTimeScale(){return this._effectiveTimeScale}setDuration(t){return this.timeScale=this._clip.duration/t,this.stopWarping()}syncWith(t){return this.time=t.time,this.timeScale=t.timeScale,this.stopWarping()}halt(t){return this.warp(this._effectiveTimeScale,0,t)}warp(t,e,n){const i=this._mixer,r=i.time,a=this.timeScale;let o=this._timeScaleInterpolant;o===null&&(o=i._lendControlInterpolant(),this._timeScaleInterpolant=o);const l=o.parameterPositions,c=o.sampleValues;return l[0]=r,l[1]=r+n,c[0]=t/a,c[1]=e/a,this}stopWarping(){const t=this._timeScaleInterpolant;return t!==null&&(this._timeScaleInterpolant=null,this._mixer._takeBackControlInterpolant(t)),this._restoreTimeScale=null,this}getMixer(){return this._mixer}getClip(){return this._clip}getRoot(){return this._localRoot||this._mixer._root}_update(t,e,n,i){if(!this.enabled){this._updateWeight(t);return}const r=this._startTime;if(r!==null){const l=(t-r)*n;l<0||n===0?e=0:(this._startTime=null,e=n*l)}e*=this._updateTimeScale(t);const a=this._updateTime(e),o=this._updateWeight(t);if(o>0){const l=this._interpolants,c=this._propertyBindings;switch(this.blendMode){case iu:for(let h=0,f=l.length;h!==f;++h)l[h].evaluate(a),c[h].accumulateAdditive(o);break;case Yl:default:for(let h=0,f=l.length;h!==f;++h)l[h].evaluate(a),c[h].accumulate(i,o)}}}_updateWeight(t){let e=0;if(this.enabled){e=this.weight;const n=this._weightInterpolant;if(n!==null){const i=n.evaluate(t)[0];e*=i,t>n.parameterPositions[1]&&(this.stopFading(),i===0&&(this.enabled=!1))}}return this._effectiveWeight=e,e}_updateTimeScale(t){let e=0;if(!this.paused){e=this.timeScale;const n=this._timeScaleInterpolant;if(n!==null){const i=n.evaluate(t)[0];e*=i,t>n.parameterPositions[1]&&(e===0?this.paused=!0:(this._restoreTimeScale!==null&&(e=this._restoreTimeScale),this.timeScale=e),this.stopWarping())}}return this._effectiveTimeScale=e,e}_updateTime(t){const e=this._clip.duration,n=this.loop;let i=this.time+t,r=this._loopCount;const a=n===pp;if(t===0)return r===-1?i:a&&(r&1)===1?e-i:i;if(n===dp){r===-1&&(this._loopCount=0,this._setEndings(!0,!0,!1));t:{if(i>=e)i=e;else if(i<0)i=0;else{this.time=i;break t}this.clampWhenFinished?this.paused=!0:this.enabled=!1,this.time=i,this._mixer.dispatchEvent({type:"finished",action:this,direction:t<0?-1:1})}}else{if(r===-1&&(t>=0?(r=0,this._setEndings(!0,this.repetitions===0,a)):this._setEndings(this.repetitions===0,!0,a)),i>=e||i<0){const o=Math.floor(i/e);i-=e*o,r+=Math.abs(o);const l=this.repetitions-r;if(l<=0)this.clampWhenFinished?this.paused=!0:this.enabled=!1,i=t>0?e:0,this.time=i,this._mixer.dispatchEvent({type:"finished",action:this,direction:t>0?1:-1});else{if(l===1){const c=t<0;this._setEndings(c,!c,a)}else this._setEndings(!1,!1,a);this._loopCount=r,this.time=i,this._mixer.dispatchEvent({type:"loop",action:this,loopDelta:o})}}else this._loopCount=r,this.time=i;if(a&&(r&1)===1)return e-i}return i}_setEndings(t,e,n){const i=this._interpolantSettings;n?(i.endingStart=vs,i.endingEnd=vs):(t?i.endingStart=this.zeroSlopeAtStart?vs:ys:i.endingStart=ya,e?i.endingEnd=this.zeroSlopeAtEnd?vs:ys:i.endingEnd=ya)}_scheduleFading(t,e,n){const i=this._mixer,r=i.time;let a=this._weightInterpolant;a===null&&(a=i._lendControlInterpolant(),this._weightInterpolant=a);const o=a.parameterPositions,l=a.sampleValues;return o[0]=r,l[0]=e,o[1]=r+t,l[1]=n,this}}const Ox=new Float32Array(1);class Bx extends Jn{constructor(t){super(),this._root=t,this._initMemoryManager(),this._accuIndex=0,this.time=0,this.timeScale=1,typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}_bindAction(t,e){const n=t._localRoot||this._root,i=t._clip.tracks,r=i.length,a=t._propertyBindings,o=t._interpolants,l=n.uuid,c=this._bindingsByRootAndName;let h=c[l];h===void 0&&(h={},c[l]=h);for(let f=0;f!==r;++f){const u=i[f],d=u.name;let p=h[d];if(p!==void 0)++p.referenceCount,a[f]=p;else{if(p=a[f],p!==void 0){p._cacheIndex===null&&(++p.referenceCount,this._addInactiveBinding(p,l,d));continue}const _=e&&e._propertyBindings[f].binding.parsedPath;p=new bm(le.create(n,d,_),u.ValueTypeName,u.getValueSize()),++p.referenceCount,this._addInactiveBinding(p,l,d),a[f]=p}o[f].resultBuffer=p.buffer}}_activateAction(t){if(!this._isActiveAction(t)){if(t._cacheIndex===null){const n=(t._localRoot||this._root).uuid,i=t._clip.uuid,r=this._actionsByClip[i];this._bindAction(t,r&&r.knownActions[0]),this._addInactiveAction(t,i,n)}const e=t._propertyBindings;for(let n=0,i=e.length;n!==i;++n){const r=e[n];r.useCount++===0&&(this._lendBinding(r),r.saveOriginalState())}this._lendAction(t)}}_deactivateAction(t){if(this._isActiveAction(t)){const e=t._propertyBindings;for(let n=0,i=e.length;n!==i;++n){const r=e[n];--r.useCount===0&&(r.restoreOriginalState(),this._takeBackBinding(r))}this._takeBackAction(t)}}_initMemoryManager(){this._actions=[],this._nActiveActions=0,this._actionsByClip={},this._bindings=[],this._nActiveBindings=0,this._bindingsByRootAndName={},this._controlInterpolants=[],this._nActiveControlInterpolants=0;const t=this;this.stats={actions:{get total(){return t._actions.length},get inUse(){return t._nActiveActions}},bindings:{get total(){return t._bindings.length},get inUse(){return t._nActiveBindings}},controlInterpolants:{get total(){return t._controlInterpolants.length},get inUse(){return t._nActiveControlInterpolants}}}}_isActiveAction(t){const e=t._cacheIndex;return e!==null&&e<this._nActiveActions}_addInactiveAction(t,e,n){const i=this._actions,r=this._actionsByClip;let a=r[e];if(a===void 0)a={knownActions:[t],actionByRoot:{}},t._byClipCacheIndex=0,r[e]=a;else{const o=a.knownActions;t._byClipCacheIndex=o.length,o.push(t)}t._cacheIndex=i.length,i.push(t),a.actionByRoot[n]=t}_removeInactiveAction(t){const e=this._actions,n=e[e.length-1],i=t._cacheIndex;n._cacheIndex=i,e[i]=n,e.pop(),t._cacheIndex=null;const r=t._clip.uuid,a=this._actionsByClip,o=a[r],l=o.knownActions,c=l[l.length-1],h=t._byClipCacheIndex;c._byClipCacheIndex=h,l[h]=c,l.pop(),t._byClipCacheIndex=null;const f=o.actionByRoot,u=(t._localRoot||this._root).uuid;delete f[u],l.length===0&&delete a[r],this._removeInactiveBindingsForAction(t)}_removeInactiveBindingsForAction(t){const e=t._propertyBindings;for(let n=0,i=e.length;n!==i;++n){const r=e[n];--r.referenceCount===0&&this._removeInactiveBinding(r)}}_lendAction(t){const e=this._actions,n=t._cacheIndex,i=this._nActiveActions++,r=e[i];t._cacheIndex=i,e[i]=t,r._cacheIndex=n,e[n]=r}_takeBackAction(t){const e=this._actions,n=t._cacheIndex,i=--this._nActiveActions,r=e[i];t._cacheIndex=i,e[i]=t,r._cacheIndex=n,e[n]=r}_addInactiveBinding(t,e,n){const i=this._bindingsByRootAndName,r=this._bindings;let a=i[e];a===void 0&&(a={},i[e]=a),a[n]=t,t._cacheIndex=r.length,r.push(t)}_removeInactiveBinding(t){const e=this._bindings,n=t.binding,i=n.rootNode.uuid,r=n.path,a=this._bindingsByRootAndName,o=a[i],l=e[e.length-1],c=t._cacheIndex;l._cacheIndex=c,e[c]=l,e.pop(),delete o[r],Object.keys(o).length===0&&delete a[i]}_lendBinding(t){const e=this._bindings,n=t._cacheIndex,i=this._nActiveBindings++,r=e[i];t._cacheIndex=i,e[i]=t,r._cacheIndex=n,e[n]=r}_takeBackBinding(t){const e=this._bindings,n=t._cacheIndex,i=--this._nActiveBindings,r=e[i];t._cacheIndex=i,e[i]=t,r._cacheIndex=n,e[n]=r}_lendControlInterpolant(){const t=this._controlInterpolants,e=this._nActiveControlInterpolants++;let n=t[e];return n===void 0&&(n=new wu(new Float32Array(2),new Float32Array(2),1,Ox),n.__cacheIndex=e,t[e]=n),n}_takeBackControlInterpolant(t){const e=this._controlInterpolants,n=t.__cacheIndex,i=--this._nActiveControlInterpolants,r=e[i];t.__cacheIndex=i,e[i]=t,r.__cacheIndex=n,e[n]=r}clipAction(t,e,n){const i=e||this._root,r=i.uuid;let a=typeof t=="string"?Ca.findByName(i,t):t;const o=a!==null?a.uuid:t,l=this._actionsByClip[o];let c=null;if(n===void 0&&(a!==null?n=a.blendMode:n=Yl),l!==void 0){const f=l.actionByRoot[r];if(f!==void 0&&f.blendMode===n)return f;c=l.knownActions[0],a===null&&(a=c._clip)}if(a===null)return null;const h=new wm(this,a,e,n);return this._bindAction(h,c),this._addInactiveAction(h,o,r),h}existingAction(t,e){const n=e||this._root,i=n.uuid,r=typeof t=="string"?Ca.findByName(n,t):t,a=r?r.uuid:t,o=this._actionsByClip[a];return o!==void 0&&o.actionByRoot[i]||null}stopAllAction(){const t=this._actions,e=this._nActiveActions;for(let n=e-1;n>=0;--n)t[n].stop();return this}update(t){t*=this.timeScale;const e=this._actions,n=this._nActiveActions,i=this.time+=t,r=Math.sign(t),a=this._accuIndex^=1;for(let c=0;c!==n;++c)e[c]._update(i,t,r,a);const o=this._bindings,l=this._nActiveBindings;for(let c=0;c!==l;++c)o[c].apply(a);return this}setTime(t){this.time=0;for(let e=0;e<this._actions.length;e++)this._actions[e].time=0;return this.update(t)}getRoot(){return this._root}uncacheClip(t){const e=this._actions,n=t.uuid,i=this._actionsByClip,r=i[n];if(r!==void 0){const a=r.knownActions;for(let o=0,l=a.length;o!==l;++o){const c=a[o];this._deactivateAction(c);const h=c._cacheIndex,f=e[e.length-1];c._cacheIndex=null,c._byClipCacheIndex=null,f._cacheIndex=h,e[h]=f,e.pop(),this._removeInactiveBindingsForAction(c)}delete i[n]}}uncacheRoot(t){const e=t.uuid,n=this._actionsByClip;for(const a in n){const o=n[a].actionByRoot,l=o[e];l!==void 0&&(this._deactivateAction(l),this._removeInactiveAction(l))}const i=this._bindingsByRootAndName,r=i[e];if(r!==void 0)for(const a in r){const o=r[a];o.restoreOriginalState(),this._removeInactiveBinding(o)}}uncacheAction(t,e){const n=this.existingAction(t,e);n!==null&&(this._deactivateAction(n),this._removeInactiveAction(n))}}class zx extends ru{constructor(t=1,e=1,n=1,i={}){super(t,e,i),this.isRenderTarget3D=!0,this.depth=n;for(let r=0;r<this.textures.length;r++){const a=new Ql(null,t,e,n);a.isRenderTargetTexture=!0,a.renderTarget=this,this.textures[r]=a}this._setTextureOptions(i)}}class Nu{constructor(t){this.value=t}clone(){return new Nu(this.value.clone===void 0?this.value:this.value.clone())}}let kx=0;class Vx extends Jn{constructor(){super(),this.isUniformsGroup=!0,Object.defineProperty(this,"id",{value:kx++}),this.name="",this.usage=Jl,this.uniforms=[]}add(t){return this.uniforms.push(t),this}remove(t){const e=this.uniforms.indexOf(t);return e!==-1&&this.uniforms.splice(e,1),this}setName(t){return this.name=t,this}setUsage(t){return this.usage=t,this}dispose(){this.dispatchEvent({type:"dispose"})}copy(t){this.name=t.name,this.usage=t.usage;const e=t.uniforms;this.uniforms.length=0;for(let n=0,i=e.length;n<i;n++){const r=Array.isArray(e[n])?e[n]:[e[n]];for(let a=0;a<r.length;a++)this.uniforms.push(r[a].clone())}return this}clone(){return new this.constructor().copy(this)}}class Gx extends ec{constructor(t,e,n=1){super(t,e),this.isInstancedInterleavedBuffer=!0,this.meshPerAttribute=n}copy(t){return super.copy(t),this.meshPerAttribute=t.meshPerAttribute,this}clone(t){const e=super.clone(t);return e.meshPerAttribute=this.meshPerAttribute,e}toJSON(t){const e=super.toJSON(t);return e.isInstancedInterleavedBuffer=!0,e.meshPerAttribute=this.meshPerAttribute,e}}class Hx{constructor(t,e,n,i,r,a=!1){this.isGLBufferAttribute=!0,this.name="",this.buffer=t,this.type=e,this.itemSize=n,this.elementSize=i,this.count=r,this.normalized=a,this.version=0}set needsUpdate(t){t===!0&&this.version++}setBuffer(t){return this.buffer=t,this}setType(t,e){return this.type=t,this.elementSize=e,this}setItemSize(t){return this.itemSize=t,this}setCount(t){return this.count=t,this}}const rf=new Yt;class Wx{constructor(t,e,n=0,i=1/0){this.ray=new wr(t,e),this.near=n,this.far=i,this.camera=null,this.layers=new jl,this.params={Mesh:{},Line:{threshold:1},LOD:{},Points:{threshold:1},Sprite:{}}}set(t,e){this.ray.set(t,e)}setFromCamera(t,e){e.isPerspectiveCamera?(this.ray.origin.setFromMatrixPosition(e.matrixWorld),this.ray.direction.set(t.x,t.y,.5).unproject(e).sub(this.ray.origin).normalize(),this.camera=e):e.isOrthographicCamera?(this.ray.origin.set(t.x,t.y,e.projectionMatrix.elements[14]).unproject(e),this.ray.direction.set(0,0,-1).transformDirection(e.matrixWorld),this.camera=e):Nt("Raycaster: Unsupported camera type: "+e.type)}setFromXRController(t){return rf.identity().extractRotation(t.matrixWorld),this.ray.origin.setFromMatrixPosition(t.matrixWorld),this.ray.direction.set(0,0,-1).applyMatrix4(rf),this}intersectObject(t,e=!0,n=[]){return Ph(t,this,n,e),n.sort(af),n}intersectObjects(t,e=!0,n=[]){for(let i=0,r=t.length;i<r;i++)Ph(t[i],this,n,e);return n.sort(af),n}}function af(s,t){return s.distance-t.distance}function Ph(s,t,e,n){let i=!0;if(s.layers.test(t.layers)&&s.raycast(t,e)===!1&&(i=!1),i===!0&&n===!0){const r=s.children;for(let a=0,o=r.length;a<o;a++)Ph(r[a],t,e,!0)}}class Am{constructor(t=!0){this.autoStart=t,this.startTime=0,this.oldTime=0,this.elapsedTime=0,this.running=!1,pt("Clock: This module has been deprecated. Please use THREE.Timer instead.")}start(){this.startTime=performance.now(),this.oldTime=this.startTime,this.elapsedTime=0,this.running=!0}stop(){this.getElapsedTime(),this.running=!1,this.autoStart=!1}getElapsedTime(){return this.getDelta(),this.elapsedTime}getDelta(){let t=0;if(this.autoStart&&!this.running)return this.start(),0;if(this.running){const e=performance.now();t=(e-this.oldTime)/1e3,this.oldTime=e,this.elapsedTime+=t}return t}}class Xx{constructor(t=1,e=0,n=0){this.radius=t,this.phi=e,this.theta=n}set(t,e,n){return this.radius=t,this.phi=e,this.theta=n,this}copy(t){return this.radius=t.radius,this.phi=t.phi,this.theta=t.theta,this}makeSafe(){return this.phi=Ht(this.phi,1e-6,Math.PI-1e-6),this}setFromVector3(t){return this.setFromCartesianCoords(t.x,t.y,t.z)}setFromCartesianCoords(t,e,n){return this.radius=Math.sqrt(t*t+e*e+n*n),this.radius===0?(this.theta=0,this.phi=0):(this.theta=Math.atan2(t,n),this.phi=Math.acos(Ht(e/this.radius,-1,1))),this}clone(){return new this.constructor().copy(this)}}class qx{constructor(t=1,e=0,n=0){this.radius=t,this.theta=e,this.y=n}set(t,e,n){return this.radius=t,this.theta=e,this.y=n,this}copy(t){return this.radius=t.radius,this.theta=t.theta,this.y=t.y,this}setFromVector3(t){return this.setFromCartesianCoords(t.x,t.y,t.z)}setFromCartesianCoords(t,e,n){return this.radius=Math.sqrt(t*t+n*n),this.theta=Math.atan2(t,n),this.y=e,this}clone(){return new this.constructor().copy(this)}}const qu=class qu{constructor(t,e,n,i){this.elements=[1,0,0,1],t!==void 0&&this.set(t,e,n,i)}identity(){return this.set(1,0,0,1),this}fromArray(t,e=0){for(let n=0;n<4;n++)this.elements[n]=t[n+e];return this}set(t,e,n,i){const r=this.elements;return r[0]=t,r[2]=e,r[1]=n,r[3]=i,this}};qu.prototype.isMatrix2=!0;let Lh=qu;const of=new it;class Tm{constructor(t=new it(1/0,1/0),e=new it(-1/0,-1/0)){this.isBox2=!0,this.min=t,this.max=e}set(t,e){return this.min.copy(t),this.max.copy(e),this}setFromPoints(t){this.makeEmpty();for(let e=0,n=t.length;e<n;e++)this.expandByPoint(t[e]);return this}setFromCenterAndSize(t,e){const n=of.copy(e).multiplyScalar(.5);return this.min.copy(t).sub(n),this.max.copy(t).add(n),this}clone(){return new this.constructor().copy(this)}copy(t){return this.min.copy(t.min),this.max.copy(t.max),this}makeEmpty(){return this.min.x=this.min.y=1/0,this.max.x=this.max.y=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y}getCenter(t){return this.isEmpty()?t.set(0,0):t.addVectors(this.min,this.max).multiplyScalar(.5)}getSize(t){return this.isEmpty()?t.set(0,0):t.subVectors(this.max,this.min)}expandByPoint(t){return this.min.min(t),this.max.max(t),this}expandByVector(t){return this.min.sub(t),this.max.add(t),this}expandByScalar(t){return this.min.addScalar(-t),this.max.addScalar(t),this}containsPoint(t){return t.x>=this.min.x&&t.x<=this.max.x&&t.y>=this.min.y&&t.y<=this.max.y}containsBox(t){return this.min.x<=t.min.x&&t.max.x<=this.max.x&&this.min.y<=t.min.y&&t.max.y<=this.max.y}getParameter(t,e){return e.set((t.x-this.min.x)/(this.max.x-this.min.x),(t.y-this.min.y)/(this.max.y-this.min.y))}intersectsBox(t){return t.max.x>=this.min.x&&t.min.x<=this.max.x&&t.max.y>=this.min.y&&t.min.y<=this.max.y}clampPoint(t,e){return e.copy(t).clamp(this.min,this.max)}distanceToPoint(t){return this.clampPoint(t,of).distanceTo(t)}intersect(t){return this.min.max(t.min),this.max.min(t.max),this.isEmpty()&&this.makeEmpty(),this}union(t){return this.min.min(t.min),this.max.max(t.max),this}translate(t){return this.min.add(t),this.max.add(t),this}equals(t){return t.min.equals(this.min)&&t.max.equals(this.max)}}const lf=new I,Co=new I,tr=new I,er=new I,ch=new I,Yx=new I,Zx=new I;class $x{constructor(t=new I,e=new I){this.start=t,this.end=e}set(t,e){return this.start.copy(t),this.end.copy(e),this}copy(t){return this.start.copy(t.start),this.end.copy(t.end),this}getCenter(t){return t.addVectors(this.start,this.end).multiplyScalar(.5)}delta(t){return t.subVectors(this.end,this.start)}distanceSq(){return this.start.distanceToSquared(this.end)}distance(){return this.start.distanceTo(this.end)}at(t,e){return this.delta(e).multiplyScalar(t).add(this.start)}closestPointToPointParameter(t,e){lf.subVectors(t,this.start),Co.subVectors(this.end,this.start);const n=Co.dot(Co);if(n===0)return 0;let r=Co.dot(lf)/n;return e&&(r=Ht(r,0,1)),r}closestPointToPoint(t,e,n){const i=this.closestPointToPointParameter(t,e);return this.delta(n).multiplyScalar(i).add(this.start)}distanceSqToLine3(t,e=Yx,n=Zx){const i=10000000000000001e-32;let r,a;const o=this.start,l=t.start,c=this.end,h=t.end;tr.subVectors(c,o),er.subVectors(h,l),ch.subVectors(o,l);const f=tr.dot(tr),u=er.dot(er),d=er.dot(ch);if(f<=i&&u<=i)return e.copy(o),n.copy(l),e.sub(n),e.dot(e);if(f<=i)r=0,a=d/u,a=Ht(a,0,1);else{const p=tr.dot(ch);if(u<=i)a=0,r=Ht(-p/f,0,1);else{const _=tr.dot(er),g=f*u-_*_;g!==0?r=Ht((_*d-p*u)/g,0,1):r=0,a=(_*r+d)/u,a<0?(a=0,r=Ht(-p/f,0,1)):a>1&&(a=1,r=Ht((_-p)/f,0,1))}}return e.copy(o).addScaledVector(tr,r),n.copy(l).addScaledVector(er,a),e.distanceToSquared(n)}applyMatrix4(t){return this.start.applyMatrix4(t),this.end.applyMatrix4(t),this}equals(t){return t.start.equals(this.start)&&t.end.equals(this.end)}clone(){return new this.constructor().copy(this)}}const cf=new I;class Jx extends he{constructor(t,e){super(),this.light=t,this.matrixAutoUpdate=!1,this.color=e,this.type="SpotLightHelper";const n=new Zt,i=[0,0,0,0,0,1,0,0,0,1,0,1,0,0,0,-1,0,1,0,0,0,0,1,1,0,0,0,0,-1,1];for(let a=0,o=1,l=32;a<l;a++,o++){const c=a/l*Math.PI*2,h=o/l*Math.PI*2;i.push(Math.cos(c),Math.sin(c),1,Math.cos(h),Math.sin(h),1)}n.setAttribute("position",new Mt(i,3));const r=new pn({fog:!1,toneMapped:!1});this.cone=new di(n,r),this.add(this.cone),this.update()}dispose(){super.dispose(),this.cone.geometry.dispose(),this.cone.material.dispose()}update(){this.light.updateWorldMatrix(!0,!1),this.light.target.updateWorldMatrix(!0,!1),this.parent?(this.parent.updateWorldMatrix(!0),this.matrix.copy(this.parent.matrixWorld).invert().multiply(this.light.matrixWorld)):this.matrix.copy(this.light.matrixWorld),this.matrixWorldNeedsUpdate=!0;const t=this.light.distance?this.light.distance:1e3,e=t*Math.tan(this.light.angle);this.cone.scale.set(e,e,t),cf.setFromMatrixPosition(this.light.target.matrixWorld),this.cone.lookAt(cf),this.color!==void 0?this.cone.material.color.set(this.color):this.cone.material.color.copy(this.light.color)}}const Hi=new I,Ro=new Yt,hh=new Yt;class Kx extends di{constructor(t){const e=Em(t),n=new Zt,i=[],r=[];for(let c=0;c<e.length;c++){const h=e[c];h.parent&&h.parent.isBone&&(i.push(0,0,0),i.push(0,0,0),r.push(0,0,0),r.push(0,0,0))}n.setAttribute("position",new Mt(i,3)),n.setAttribute("color",new Mt(r,3));const a=new pn({vertexColors:!0,depthTest:!1,depthWrite:!1,toneMapped:!1,transparent:!0});super(n,a),this.isSkeletonHelper=!0,this.type="SkeletonHelper",this.root=t,this.bones=e,this.matrix=t.matrixWorld,this.matrixAutoUpdate=!1;const o=new ut(255),l=new ut(65280);this.setColors(o,l)}updateMatrixWorld(t){const e=this.bones,n=this.geometry,i=n.getAttribute("position");hh.copy(this.root.matrixWorld).invert();for(let r=0,a=0;r<e.length;r++){const o=e[r];o.parent&&o.parent.isBone&&(Ro.multiplyMatrices(hh,o.matrixWorld),Hi.setFromMatrixPosition(Ro),i.setXYZ(a,Hi.x,Hi.y,Hi.z),Ro.multiplyMatrices(hh,o.parent.matrixWorld),Hi.setFromMatrixPosition(Ro),i.setXYZ(a+1,Hi.x,Hi.y,Hi.z),a+=2)}n.getAttribute("position").needsUpdate=!0,super.updateMatrixWorld(t)}setColors(t,e){const i=this.geometry.getAttribute("color");for(let r=0;r<i.count;r+=2)i.setXYZ(r,t.r,t.g,t.b),i.setXYZ(r+1,e.r,e.g,e.b);return i.needsUpdate=!0,this}dispose(){super.dispose(),this.geometry.dispose(),this.material.dispose()}}function Em(s){const t=[];s.isBone===!0&&t.push(s);for(let e=0;e<s.children.length;e++)t.push(...Em(s.children[e]));return t}class Qx extends be{constructor(t,e,n){const i=new Tr(e,4,2),r=new hi({wireframe:!0,fog:!1,toneMapped:!1});super(i,r),this.light=t,this.color=n,this.type="PointLightHelper",this.matrix=this.light.matrixWorld,this.matrixAutoUpdate=!1,this.update()}dispose(){super.dispose(),this.geometry.dispose(),this.material.dispose()}update(){this.matrixWorldNeedsUpdate=!0,this.light.updateWorldMatrix(!0,!1),this.color!==void 0?this.material.color.set(this.color):this.material.color.copy(this.light.color)}}const jx=new I,hf=new ut,uf=new ut;class ty extends he{constructor(t,e,n){super(),this.light=t,this.matrix=t.matrixWorld,this.matrixAutoUpdate=!1,this.color=n,this.type="HemisphereLightHelper";const i=new ka(e);i.rotateY(Math.PI*.5),this.material=new hi({wireframe:!0,fog:!1,toneMapped:!1}),this.color===void 0&&(this.material.vertexColors=!0);const r=i.getAttribute("position"),a=new Float32Array(r.count*3);i.setAttribute("color",new ue(a,3)),this.add(new be(i,this.material)),this.update()}dispose(){super.dispose(),this.children[0].geometry.dispose(),this.children[0].material.dispose()}update(){const t=this.children[0];if(this.color!==void 0)this.material.color.set(this.color);else{const e=t.geometry.getAttribute("color");hf.copy(this.light.color),uf.copy(this.light.groundColor);for(let n=0,i=e.count;n<i;n++){const r=n<i/2?hf:uf;e.setXYZ(n,r.r,r.g,r.b)}e.needsUpdate=!0}this.matrixWorldNeedsUpdate=!0,this.light.updateWorldMatrix(!0,!1),t.lookAt(jx.setFromMatrixPosition(this.light.matrixWorld).negate())}}class ey extends di{constructor(t=10,e=10,n=4473924,i=8947848){n=new ut(n),i=new ut(i);const r=e/2,a=t/e,o=t/2,l=[],c=[];for(let u=0,d=0,p=-o;u<=e;u++,p+=a){l.push(-o,0,p,o,0,p),l.push(p,0,-o,p,0,o);const _=u===r?n:i;_.toArray(c,d),d+=3,_.toArray(c,d),d+=3,_.toArray(c,d),d+=3,_.toArray(c,d),d+=3}const h=new Zt;h.setAttribute("position",new Mt(l,3)),h.setAttribute("color",new Mt(c,3));const f=new pn({vertexColors:!0,toneMapped:!1});super(h,f),this.type="GridHelper"}dispose(){super.dispose(),this.geometry.dispose(),this.material.dispose()}}class ny extends di{constructor(t=10,e=16,n=8,i=64,r=4473924,a=8947848){r=new ut(r),a=new ut(a);const o=[],l=[];if(e>1)for(let f=0;f<e;f++){const u=f/e*(Math.PI*2),d=Math.sin(u)*t,p=Math.cos(u)*t;o.push(0,0,0),o.push(d,0,p);const _=f&1?r:a;l.push(_.r,_.g,_.b),l.push(_.r,_.g,_.b)}for(let f=0;f<n;f++){const u=f&1?r:a,d=t-t/n*f;for(let p=0;p<i;p++){let _=p/i*(Math.PI*2),g=Math.sin(_)*d,m=Math.cos(_)*d;o.push(g,0,m),l.push(u.r,u.g,u.b),_=(p+1)/i*(Math.PI*2),g=Math.sin(_)*d,m=Math.cos(_)*d,o.push(g,0,m),l.push(u.r,u.g,u.b)}}const c=new Zt;c.setAttribute("position",new Mt(o,3)),c.setAttribute("color",new Mt(l,3));const h=new pn({vertexColors:!0,toneMapped:!1});super(c,h),this.type="PolarGridHelper"}dispose(){super.dispose(),this.geometry.dispose(),this.material.dispose()}}const df=new I,Io=new I,ff=new I;class iy extends he{constructor(t,e,n){super(),this.light=t,this.matrix=t.matrixWorld,this.matrixAutoUpdate=!1,this.color=n,this.type="DirectionalLightHelper",e===void 0&&(e=1);let i=new Zt;i.setAttribute("position",new Mt([-e,e,0,e,e,0,e,-e,0,-e,-e,0,-e,e,0],3));const r=new pn({fog:!1,toneMapped:!1});this.lightPlane=new Qi(i,r),this.add(this.lightPlane),i=new Zt,i.setAttribute("position",new Mt([0,0,0,0,0,1],3)),this.targetLine=new Qi(i,r),this.add(this.targetLine),this.update()}dispose(){super.dispose(),this.lightPlane.geometry.dispose(),this.lightPlane.material.dispose(),this.targetLine.geometry.dispose(),this.targetLine.material.dispose()}update(){this.matrixWorldNeedsUpdate=!0,this.light.updateWorldMatrix(!0,!1),this.light.target.updateWorldMatrix(!0,!1),df.setFromMatrixPosition(this.light.matrixWorld),Io.setFromMatrixPosition(this.light.target.matrixWorld),ff.subVectors(Io,df),this.lightPlane.lookAt(Io),this.color!==void 0?(this.lightPlane.material.color.set(this.color),this.targetLine.material.color.set(this.color)):(this.lightPlane.material.color.copy(this.light.color),this.targetLine.material.color.copy(this.light.color)),this.targetLine.lookAt(Io),this.targetLine.scale.z=ff.length()}}const Po=new I,Re=new vc;class sy extends di{constructor(t){const e=new Zt,n=new pn({color:16777215,vertexColors:!0,toneMapped:!1}),i=[],r=[],a={};o("n1","n2"),o("n2","n4"),o("n4","n3"),o("n3","n1"),o("f1","f2"),o("f2","f4"),o("f4","f3"),o("f3","f1"),o("n1","f1"),o("n2","f2"),o("n3","f3"),o("n4","f4"),o("p","n1"),o("p","n2"),o("p","n3"),o("p","n4"),o("u1","u2"),o("u2","u3"),o("u3","u1"),o("c","t"),o("p","c"),o("cn1","cn2"),o("cn3","cn4"),o("cf1","cf2"),o("cf3","cf4");function o(p,_){l(p),l(_)}function l(p){i.push(0,0,0),r.push(0,0,0),a[p]===void 0&&(a[p]=[]),a[p].push(i.length/3-1)}e.setAttribute("position",new Mt(i,3)),e.setAttribute("color",new Mt(r,3)),super(e,n),this.type="CameraHelper",this.camera=t,this.camera.updateProjectionMatrix&&this.camera.updateProjectionMatrix(),this.matrix=t.matrixWorld,this.matrixAutoUpdate=!1,this.pointMap=a,this.update();const c=new ut(16755200),h=new ut(16711680),f=new ut(43775),u=new ut(16777215),d=new ut(3355443);this.setColors(c,h,f,u,d)}setColors(t,e,n,i,r){const o=this.geometry.getAttribute("color");return o.setXYZ(0,t.r,t.g,t.b),o.setXYZ(1,t.r,t.g,t.b),o.setXYZ(2,t.r,t.g,t.b),o.setXYZ(3,t.r,t.g,t.b),o.setXYZ(4,t.r,t.g,t.b),o.setXYZ(5,t.r,t.g,t.b),o.setXYZ(6,t.r,t.g,t.b),o.setXYZ(7,t.r,t.g,t.b),o.setXYZ(8,t.r,t.g,t.b),o.setXYZ(9,t.r,t.g,t.b),o.setXYZ(10,t.r,t.g,t.b),o.setXYZ(11,t.r,t.g,t.b),o.setXYZ(12,t.r,t.g,t.b),o.setXYZ(13,t.r,t.g,t.b),o.setXYZ(14,t.r,t.g,t.b),o.setXYZ(15,t.r,t.g,t.b),o.setXYZ(16,t.r,t.g,t.b),o.setXYZ(17,t.r,t.g,t.b),o.setXYZ(18,t.r,t.g,t.b),o.setXYZ(19,t.r,t.g,t.b),o.setXYZ(20,t.r,t.g,t.b),o.setXYZ(21,t.r,t.g,t.b),o.setXYZ(22,t.r,t.g,t.b),o.setXYZ(23,t.r,t.g,t.b),o.setXYZ(24,e.r,e.g,e.b),o.setXYZ(25,e.r,e.g,e.b),o.setXYZ(26,e.r,e.g,e.b),o.setXYZ(27,e.r,e.g,e.b),o.setXYZ(28,e.r,e.g,e.b),o.setXYZ(29,e.r,e.g,e.b),o.setXYZ(30,e.r,e.g,e.b),o.setXYZ(31,e.r,e.g,e.b),o.setXYZ(32,n.r,n.g,n.b),o.setXYZ(33,n.r,n.g,n.b),o.setXYZ(34,n.r,n.g,n.b),o.setXYZ(35,n.r,n.g,n.b),o.setXYZ(36,n.r,n.g,n.b),o.setXYZ(37,n.r,n.g,n.b),o.setXYZ(38,i.r,i.g,i.b),o.setXYZ(39,i.r,i.g,i.b),o.setXYZ(40,r.r,r.g,r.b),o.setXYZ(41,r.r,r.g,r.b),o.setXYZ(42,r.r,r.g,r.b),o.setXYZ(43,r.r,r.g,r.b),o.setXYZ(44,r.r,r.g,r.b),o.setXYZ(45,r.r,r.g,r.b),o.setXYZ(46,r.r,r.g,r.b),o.setXYZ(47,r.r,r.g,r.b),o.setXYZ(48,r.r,r.g,r.b),o.setXYZ(49,r.r,r.g,r.b),o.needsUpdate=!0,this}update(){const t=this.geometry,e=this.pointMap,n=1,i=1;let r,a;if(Re.projectionMatrixInverse.copy(this.camera.projectionMatrixInverse),this.camera.reversedDepth===!0)r=1,a=0;else if(this.camera.coordinateSystem===En)r=-1,a=1;else if(this.camera.coordinateSystem===As)r=0,a=1;else throw new Error("THREE.CameraHelper.update(): Invalid coordinate system: "+this.camera.coordinateSystem);De("c",e,t,Re,0,0,r),De("t",e,t,Re,0,0,a),De("n1",e,t,Re,-n,-i,r),De("n2",e,t,Re,n,-i,r),De("n3",e,t,Re,-n,i,r),De("n4",e,t,Re,n,i,r),De("f1",e,t,Re,-n,-i,a),De("f2",e,t,Re,n,-i,a),De("f3",e,t,Re,-n,i,a),De("f4",e,t,Re,n,i,a),De("u1",e,t,Re,n*.7,i*1.1,r),De("u2",e,t,Re,-n*.7,i*1.1,r),De("u3",e,t,Re,0,i*2,r),De("cf1",e,t,Re,-n,0,a),De("cf2",e,t,Re,n,0,a),De("cf3",e,t,Re,0,-i,a),De("cf4",e,t,Re,0,i,a),De("cn1",e,t,Re,-n,0,r),De("cn2",e,t,Re,n,0,r),De("cn3",e,t,Re,0,-i,r),De("cn4",e,t,Re,0,i,r),t.getAttribute("position").needsUpdate=!0}dispose(){super.dispose(),this.geometry.dispose(),this.material.dispose()}}function De(s,t,e,n,i,r,a){Po.set(i,r,a).unproject(n);const o=t[s];if(o!==void 0){const l=e.getAttribute("position");for(let c=0,h=o.length;c<h;c++)l.setXYZ(o[c],Po.x,Po.y,Po.z)}}const Lo=new rn;class ry extends di{constructor(t,e=16776960){const n=new Uint16Array([0,1,1,2,2,3,3,0,4,5,5,6,6,7,7,4,0,4,1,5,2,6,3,7]),i=new Float32Array(24),r=new Zt;r.setIndex(new ue(n,1)),r.setAttribute("position",new ue(i,3)),super(r,new pn({color:e,toneMapped:!1})),this.object=t,this.type="BoxHelper",this.matrixAutoUpdate=!1,this.update()}update(){if(this.object!==void 0&&Lo.setFromObject(this.object),Lo.isEmpty())return;const t=Lo.min,e=Lo.max,n=this.geometry.attributes.position,i=n.array;i[0]=e.x,i[1]=e.y,i[2]=e.z,i[3]=t.x,i[4]=e.y,i[5]=e.z,i[6]=t.x,i[7]=t.y,i[8]=e.z,i[9]=e.x,i[10]=t.y,i[11]=e.z,i[12]=e.x,i[13]=e.y,i[14]=t.z,i[15]=t.x,i[16]=e.y,i[17]=t.z,i[18]=t.x,i[19]=t.y,i[20]=t.z,i[21]=e.x,i[22]=t.y,i[23]=t.z,n.needsUpdate=!0,this.geometry.computeBoundingSphere()}setFromObject(t){return this.object=t,this.update(),this}copy(t,e){return super.copy(t,e),this.object=t.object,this}dispose(){super.dispose(),this.geometry.dispose(),this.material.dispose()}}class ay extends di{constructor(t,e=16776960){const n=new Uint16Array([0,1,1,2,2,3,3,0,4,5,5,6,6,7,7,4,0,4,1,5,2,6,3,7]),i=[1,1,1,-1,1,1,-1,-1,1,1,-1,1,1,1,-1,-1,1,-1,-1,-1,-1,1,-1,-1],r=new Zt;r.setIndex(new ue(n,1)),r.setAttribute("position",new Mt(i,3)),super(r,new pn({color:e,toneMapped:!1})),this.box=t,this.type="Box3Helper",this.geometry.computeBoundingSphere()}updateMatrixWorld(t){const e=this.box;e.isEmpty()||(e.getCenter(this.position),e.getSize(this.scale),this.scale.multiplyScalar(.5),super.updateMatrixWorld(t))}dispose(){super.dispose(),this.geometry.dispose(),this.material.dispose()}}class oy extends Qi{constructor(t,e=1,n=16776960){const i=n,r=[1,-1,0,-1,1,0,-1,-1,0,1,1,0,-1,1,0,-1,-1,0,1,-1,0,1,1,0],a=new Zt;a.setAttribute("position",new Mt(r,3)),a.computeBoundingSphere(),super(a,new pn({color:i,toneMapped:!1})),this.type="PlaneHelper",this.plane=t,this.size=e;const o=[1,1,0,-1,1,0,-1,-1,0,1,1,0,-1,-1,0,1,-1,0],l=new Zt;l.setAttribute("position",new Mt(o,3)),l.computeBoundingSphere(),this.add(new be(l,new hi({color:i,opacity:.2,transparent:!0,depthWrite:!1,toneMapped:!1})))}updateMatrixWorld(t){this.position.set(0,0,0),this.scale.set(.5*this.size,.5*this.size,1),this.lookAt(this.plane.normal),this.translateZ(-this.plane.constant),super.updateMatrixWorld(t)}dispose(){super.dispose(),this.geometry.dispose(),this.material.dispose(),this.children[0].geometry.dispose(),this.children[0].material.dispose()}}const pf=new I;let Do,uh;class ly extends he{constructor(t=new I(0,0,1),e=new I(0,0,0),n=1,i=16776960,r=n*.2,a=r*.2){super(),this.type="ArrowHelper",Do===void 0&&(Do=new Zt,Do.setAttribute("position",new Mt([0,0,0,0,1,0],3)),uh=new Ba(.5,1,5,1),uh.translate(0,-.5,0)),this.position.copy(e),this.line=new Qi(Do,new pn({color:i,toneMapped:!1})),this.line.matrixAutoUpdate=!1,this.add(this.line),this.cone=new be(uh,new hi({color:i,toneMapped:!1})),this.cone.matrixAutoUpdate=!1,this.add(this.cone),this.setDirection(t),this.setLength(n,r,a)}setDirection(t){if(t.y>.99999)this.quaternion.set(0,0,0,1);else if(t.y<-.99999)this.quaternion.set(1,0,0,0);else{pf.set(t.z,0,-t.x).normalize();const e=Math.acos(t.y);this.quaternion.setFromAxisAngle(pf,e)}}setLength(t,e=t*.2,n=e*.2){this.line.scale.set(1,Math.max(1e-4,t-e),1),this.line.updateMatrix(),this.cone.scale.set(n,e,n),this.cone.position.y=t,this.cone.updateMatrix()}setColor(t){this.line.material.color.set(t),this.cone.material.color.set(t)}copy(t){return super.copy(t,!1),this.line.copy(t.line),this.cone.copy(t.cone),this}dispose(){super.dispose(),this.line.geometry.dispose(),this.line.material.dispose(),this.cone.geometry.dispose(),this.cone.material.dispose()}}class cy extends di{constructor(t=1){const e=[0,0,0,t,0,0,0,0,0,0,t,0,0,0,0,0,0,t],n=[1,0,0,1,.6,0,0,1,0,.6,1,0,0,0,1,0,.6,1],i=new Zt;i.setAttribute("position",new Mt(e,3)),i.setAttribute("color",new Mt(n,3));const r=new pn({vertexColors:!0,toneMapped:!1});super(i,r),this.type="AxesHelper"}setColors(t,e,n){const i=new ut,r=this.geometry.attributes.color.array;return i.set(t),i.toArray(r,0),i.toArray(r,3),i.set(e),i.toArray(r,6),i.toArray(r,9),i.set(n),i.toArray(r,12),i.toArray(r,15),this.geometry.attributes.color.needsUpdate=!0,this}dispose(){super.dispose(),this.geometry.dispose(),this.material.dispose()}}class hy{constructor(){this.type="ShapePath",this.color=new ut,this.subPaths=[],this.currentPath=null,this.userData={}}moveTo(t,e){return this.currentPath=new wa,this.subPaths.push(this.currentPath),this.currentPath.moveTo(t,e),this}lineTo(t,e){return this.currentPath.lineTo(t,e),this}quadraticCurveTo(t,e,n,i){return this.currentPath.quadraticCurveTo(t,e,n,i),this}bezierCurveTo(t,e,n,i,r,a){return this.currentPath.bezierCurveTo(t,e,n,i,r,a),this}splineThru(t){return this.currentPath.splineThru(t),this}toShapes(){function t(l,c){let h=!1;const f=c.length;for(let u=0,d=f-1;u<f;d=u++){const p=c[u],_=c[d];p.y>l.y!=_.y>l.y&&l.x<(_.x-p.x)*(l.y-p.y)/(_.y-p.y)+p.x&&(h=!h)}return h}function e(l,c){const h=c.getCenter(new it);if(t(h,l))return h;const f=h.y,u=[],d=l.length;for(let p=0;p<d;p++){const _=l[p],g=l[(p+1)%d];if(_.y>f!=g.y>f){const m=_.x+(f-_.y)*(g.x-_.x)/(g.y-_.y);u.push(m)}}return u.length>1&&(u.sort((p,_)=>p-_),h.x=(u[0]+u[1])/2),h}let n=this.userData.style&&this.userData.style.fillRule||"nonzero";n!=="nonzero"&&n!=="evenodd"&&(pt('Fill-rule "'+n+'" is not supported, falling back to "nonzero".'),n="nonzero");const i=n==="nonzero"?(l=>l!==0):(l=>(l&1)!==0),r=[];for(const l of this.subPaths){const c=l.getPoints();if(c.length<3)continue;const h=qn.area(c);if(h===0)continue;const f=new Tm;for(let u=0;u<c.length;u++)f.expandByPoint(c[u]);r.push({subPath:l,points:c,boundingBox:f,interiorPoint:e(c,f),absArea:Math.abs(h),winding:h<0?-1:1,container:null,exclude:!1,role:null})}r.sort((l,c)=>c.absArea-l.absArea);for(let l=0;l<r.length;l++){const c=r[l];let h=0;for(let f=l-1;f>=0;f--){const u=r[f];if(u.boundingBox.containsBox(c.boundingBox)&&t(c.interiorPoint,u.points)){c.container=u.exclude?u.container:u,h=u.winding,c.winding+=h;break}}i(c.winding)===i(h)&&(c.exclude=!0)}for(const l of r)l.exclude||(l.role=l.container===null||l.container.role==="hole"?"outer":"hole");const a=[],o=new Map;for(const l of r){if(l.exclude||l.role!=="outer")continue;const c=new za;c.curves=l.subPath.curves,a.push(c),o.set(l,c)}for(const l of r){if(l.exclude||l.role!=="hole")continue;const c=o.get(l.container);if(!c)continue;const h=new wa;h.curves=l.subPath.curves,c.holes.push(h)}return a}}class uy extends Jn{constructor(t,e=null){super(),this.object=t,this.domElement=e,this.enabled=!0,this.state=-1,this.keys={},this.mouseButtons={LEFT:null,MIDDLE:null,RIGHT:null},this.touches={ONE:null,TWO:null}}connect(t){this.domElement!==null&&this.disconnect(),this.domElement=t}disconnect(){}dispose(){}update(){}}function dy(s,t){const e=s.image&&s.image.width?s.image.width/s.image.height:1;return e>t?(s.repeat.x=1,s.repeat.y=e/t,s.offset.x=0,s.offset.y=(1-s.repeat.y)/2):(s.repeat.x=t/e,s.repeat.y=1,s.offset.x=(1-s.repeat.x)/2,s.offset.y=0),s}function fy(s,t){const e=s.image&&s.image.width?s.image.width/s.image.height:1;return e>t?(s.repeat.x=t/e,s.repeat.y=1,s.offset.x=(1-s.repeat.x)/2,s.offset.y=0):(s.repeat.x=1,s.repeat.y=e/t,s.offset.x=0,s.offset.y=(1-s.repeat.y)/2),s}function py(s){return s.repeat.x=1,s.repeat.y=1,s.offset.x=0,s.offset.y=0,s}function Dh(s,t,e,n){const i=my(n);switch(e){case eu:return s*t;case Wl:return s*t/i.components*i.byteLength;case Na:return s*t/i.components*i.byteLength;case Ji:return s*t*2/i.components*i.byteLength;case Xl:return s*t*2/i.components*i.byteLength;case nu:return s*t*3/i.components*i.byteLength;case dn:return s*t*4/i.components*i.byteLength;case ql:return s*t*4/i.components*i.byteLength;case ra:case aa:return Math.floor((s+3)/4)*Math.floor((t+3)/4)*8;case oa:case la:return Math.floor((s+3)/4)*Math.floor((t+3)/4)*16;case jo:case el:return Math.max(s,16)*Math.max(t,8)/4;case Qo:case tl:return Math.max(s,8)*Math.max(t,8)/2;case nl:case il:case rl:case al:return Math.floor((s+3)/4)*Math.floor((t+3)/4)*8;case sl:case ga:case ol:return Math.floor((s+3)/4)*Math.floor((t+3)/4)*16;case ll:return Math.floor((s+3)/4)*Math.floor((t+3)/4)*16;case cl:return Math.floor((s+4)/5)*Math.floor((t+3)/4)*16;case hl:return Math.floor((s+4)/5)*Math.floor((t+4)/5)*16;case ul:return Math.floor((s+5)/6)*Math.floor((t+4)/5)*16;case dl:return Math.floor((s+5)/6)*Math.floor((t+5)/6)*16;case fl:return Math.floor((s+7)/8)*Math.floor((t+4)/5)*16;case pl:return Math.floor((s+7)/8)*Math.floor((t+5)/6)*16;case ml:return Math.floor((s+7)/8)*Math.floor((t+7)/8)*16;case gl:return Math.floor((s+9)/10)*Math.floor((t+4)/5)*16;case _l:return Math.floor((s+9)/10)*Math.floor((t+5)/6)*16;case xl:return Math.floor((s+9)/10)*Math.floor((t+7)/8)*16;case yl:return Math.floor((s+9)/10)*Math.floor((t+9)/10)*16;case vl:return Math.floor((s+11)/12)*Math.floor((t+9)/10)*16;case Ml:return Math.floor((s+11)/12)*Math.floor((t+11)/12)*16;case Sl:case bl:case wl:return Math.ceil(s/4)*Math.ceil(t/4)*16;case Al:case Tl:return Math.ceil(s/4)*Math.ceil(t/4)*8;case _a:case El:return Math.ceil(s/4)*Math.ceil(t/4)*16}throw new Error(`Unable to determine texture byte length for ${e} format.`)}function my(s){switch(s){case _n:case Kh:return{byteLength:1,components:1};case pr:case Qh:case Zn:return{byteLength:2,components:1};case Gl:case Hl:return{byteLength:2,components:4};case Un:case Vl:case un:return{byteLength:4,components:1};case jh:case tu:return{byteLength:4,components:3}}throw new Error(`THREE.TextureUtils: Unknown texture type ${s}.`)}class gy{static contain(t,e){return dy(t,e)}static cover(t,e){return fy(t,e)}static fill(t){return py(t)}static getByteLength(t,e,n,i){return Dh(t,e,n,i)}}typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("register",{detail:{revision:Bl}}));typeof window<"u"&&(window.__THREE__?pt("WARNING: Multiple instances of Three.js being imported."):window.__THREE__=Bl);function Cm(){let s=null,t=!1,e=null,n=null;function i(r,a){n=s.requestAnimationFrame(i),e(r,a)}return{start:function(){t!==!0&&e!==null&&s!==null&&(n=s.requestAnimationFrame(i),t=!0)},stop:function(){s!==null&&s.cancelAnimationFrame(n),t=!1},setAnimationLoop:function(r){e=r},setContext:function(r){s=r}}}function _y(s){const t=new WeakMap;function e(o,l){const c=o.array,h=o.usage,f=c.byteLength,u=s.createBuffer();s.bindBuffer(l,u),s.bufferData(l,c,h),o.onUploadCallback();let d;if(c instanceof Float32Array)d=s.FLOAT;else if(typeof Float16Array<"u"&&c instanceof Float16Array)d=s.HALF_FLOAT;else if(c instanceof Uint16Array)o.isFloat16BufferAttribute?d=s.HALF_FLOAT:d=s.UNSIGNED_SHORT;else if(c instanceof Int16Array)d=s.SHORT;else if(c instanceof Uint32Array)d=s.UNSIGNED_INT;else if(c instanceof Int32Array)d=s.INT;else if(c instanceof Int8Array)d=s.BYTE;else if(c instanceof Uint8Array)d=s.UNSIGNED_BYTE;else if(c instanceof Uint8ClampedArray)d=s.UNSIGNED_BYTE;else throw new Error("THREE.WebGLAttributes: Unsupported buffer data format: "+c);return{buffer:u,type:d,bytesPerElement:c.BYTES_PER_ELEMENT,version:o.version,size:f}}function n(o,l,c){const h=l.array,f=l.updateRanges;if(s.bindBuffer(c,o),f.length===0)s.bufferSubData(c,0,h);else{f.sort((d,p)=>d.start-p.start);let u=0;for(let d=1;d<f.length;d++){const p=f[u],_=f[d];_.start<=p.start+p.count+1?p.count=Math.max(p.count,_.start+_.count-p.start):(++u,f[u]=_)}f.length=u+1;for(let d=0,p=f.length;d<p;d++){const _=f[d];s.bufferSubData(c,_.start*h.BYTES_PER_ELEMENT,h,_.start,_.count)}l.clearUpdateRanges()}l.onUploadCallback()}function i(o){return o.isInterleavedBufferAttribute&&(o=o.data),t.get(o)}function r(o){o.isInterleavedBufferAttribute&&(o=o.data);const l=t.get(o);l&&(s.deleteBuffer(l.buffer),t.delete(o))}function a(o,l){if(o.isInterleavedBufferAttribute&&(o=o.data),o.isGLBufferAttribute){const h=t.get(o);(!h||h.version<o.version)&&t.set(o,{buffer:o.buffer,type:o.type,bytesPerElement:o.elementSize,version:o.version});return}const c=t.get(o);if(c===void 0)t.set(o,e(o,l));else if(c.version<o.version){if(c.size!==o.array.byteLength)throw new Error("THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.");n(c.buffer,o,l),c.version=o.version}}return{get:i,remove:r,update:a}}var xy=`#ifdef USE_ALPHAHASH
	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif`,yy=`#ifdef USE_ALPHAHASH
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
#endif`,vy=`#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif`,My=`#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,Sy=`#ifdef USE_ALPHATEST
	#ifdef ALPHA_TO_COVERAGE
	diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );
	if ( diffuseColor.a == 0.0 ) discard;
	#else
	if ( diffuseColor.a < alphaTest ) discard;
	#endif
#endif`,by=`#ifdef USE_ALPHATEST
	uniform float alphaTest;
#endif`,wy=`#ifdef USE_AOMAP
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
#endif`,Ay=`#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif`,Ty=`#ifdef USE_BATCHING
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
#endif`,Ey=`#ifdef USE_BATCHING
	mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );
#endif`,Cy=`vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif`,Ry=`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif`,Iy=`float G_BlinnPhong_Implicit( ) {
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
} // validated`,Py=`#ifdef USE_IRIDESCENCE
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
#endif`,Ly=`#ifdef USE_BUMPMAP
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
#endif`,Dy=`#if NUM_CLIPPING_PLANES > 0
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
#endif`,Ny=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`,Uy=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif`,Fy=`#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif`,Oy=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#endif`,By=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#endif`,zy=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	varying vec4 vColor;
#endif`,ky=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
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
#endif`,Vy=`#define PI 3.141592653589793
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
} // validated`,Gy=`#ifdef ENVMAP_TYPE_CUBE_UV
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
#endif`,Hy=`vec3 transformedNormal = objectNormal;
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
#endif`,Wy=`#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif`,Xy=`#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif`,qy=`#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	#ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
		emissiveColor = sRGBTransferEOTF( emissiveColor );
	#endif
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,Yy=`#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif`,Zy="gl_FragColor = linearToOutputTexel( gl_FragColor );",$y=`vec4 LinearTransferOETF( in vec4 value ) {
	return value;
}
vec4 sRGBTransferEOTF( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}
vec4 sRGBTransferOETF( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}`,Jy=`#ifdef USE_ENVMAP
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
#endif`,Ky=`#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform mat3 envMapRotation;
	#ifdef ENVMAP_TYPE_CUBE
		uniform samplerCube envMap;
	#else
		uniform sampler2D envMap;
	#endif
#endif`,Qy=`#ifdef USE_ENVMAP
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
#endif`,jy=`#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif`,tv=`#ifdef USE_ENVMAP
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
#endif`,ev=`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
#endif`,nv=`#ifdef USE_FOG
	varying float vFogDepth;
#endif`,iv=`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,sv=`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,rv=`#ifdef USE_GRADIENTMAP
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
}`,av=`#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif`,ov=`LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;`,lv=`varying vec3 vViewPosition;
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
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert`,cv=`uniform bool receiveShadow;
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
#include <lightprobes_pars_fragment>`,hv=`#ifdef USE_ENVMAP
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
#endif`,uv=`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;`,dv=`varying vec3 vViewPosition;
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
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon`,fv=`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;`,pv=`varying vec3 vViewPosition;
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
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong`,mv=`PhysicalMaterial material;
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
#endif`,gv=`uniform sampler2D dfgLUT;
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
}`,_v=`
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
#endif`,xv=`#if defined( RE_IndirectDiffuse )
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
#endif`,yv=`#if defined( RE_IndirectDiffuse )
	#if defined( LAMBERT ) || defined( PHONG )
		irradiance += iblIrradiance;
	#endif
	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`,vv=`#ifdef USE_LIGHT_PROBES_GRID
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
#endif`,Mv=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif`,Sv=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,bv=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,wv=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	vFragDepth = 1.0 + gl_Position.w;
	vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
#endif`,Av=`#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,Tv=`#ifdef USE_MAP
	uniform sampler2D map;
#endif`,Ev=`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
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
#endif`,Cv=`#if defined( USE_POINTS_UV )
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
#endif`,Rv=`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif`,Iv=`#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif`,Pv=`#ifdef USE_INSTANCING_MORPH
	float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;
	}
#endif`,Lv=`#if defined( USE_MORPHCOLORS )
	vColor *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		#if defined( USE_COLOR_ALPHA )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
		#elif defined( USE_COLOR )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
		#endif
	}
#endif`,Dv=`#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,Nv=`#ifdef USE_MORPHTARGETS
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
#endif`,Uv=`#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,Fv=`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
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
vec3 nonPerturbedNormal = normal;`,Ov=`#ifdef USE_NORMALMAP_OBJECTSPACE
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
#endif`,Bv=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,zv=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,kv=`#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
		#ifdef FLIP_SIDED
			vBitangent = - vBitangent;
		#endif
	#endif
#endif`,Vv=`#ifdef USE_NORMALMAP
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
#endif`,Gv=`#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal = nonPerturbedNormal;
#endif`,Hv=`#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif`,Wv=`#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif`,Xv=`#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif`,qv=`#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,Yv=`vec3 packNormalToRGB( const in vec3 normal ) {
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
}`,Zv=`#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif`,$v=`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,Jv=`#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif`,Kv=`#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif`,Qv=`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif`,jv=`#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif`,tM=`#if NUM_SPOT_LIGHT_COORDS > 0
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
#endif`,eM=`#if NUM_SPOT_LIGHT_COORDS > 0
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
#endif`,nM=`#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_SUN_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
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
#endif`,iM=`float getShadowMask() {
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
}`,sM=`#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif`,rM=`#ifdef USE_SKINNING
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
#endif`,aM=`#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif`,oM=`#ifdef USE_SKINNING
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
#endif`,lM=`float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif`,cM=`#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif`,hM=`#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`,uM=`#ifndef saturate
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
vec3 CustomToneMapping( vec3 color ) { return color; }`,dM=`#ifdef USE_TRANSMISSION
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
#endif`,fM=`#ifdef USE_TRANSMISSION
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
#endif`,pM=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
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
#endif`,mM=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
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
#endif`,gM=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
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
#endif`,_M=`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif`;const xM=`varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`,yM=`uniform sampler2D t2D;
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
}`,vM=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,MM=`#ifdef ENVMAP_TYPE_CUBE
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
}`,SM=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,bM=`uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;
varying vec3 vWorldDirection;
void main() {
	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );
	gl_FragColor = texColor;
	gl_FragColor.a *= opacity;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,wM=`#include <common>
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
}`,AM=`#if DEPTH_PACKING == 3200
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
}`,TM=`#define DISTANCE
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
}`,EM=`#define DISTANCE
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
}`,CM=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
}`,RM=`uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,IM=`uniform float scale;
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
}`,PM=`uniform vec3 diffuse;
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
}`,LM=`#include <common>
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
}`,DM=`uniform vec3 diffuse;
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
}`,NM=`#define LAMBERT
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
}`,UM=`#define LAMBERT
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
}`,FM=`#define MATCAP
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
}`,OM=`#define MATCAP
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
}`,BM=`#define NORMAL
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
}`,zM=`#define NORMAL
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
}`,kM=`#define PHONG
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
}`,VM=`#define PHONG
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
}`,GM=`#define STANDARD
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
}`,HM=`#define STANDARD
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
}`,WM=`#define TOON
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
}`,XM=`#define TOON
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
}`,qM=`uniform float size;
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
}`,YM=`uniform vec3 diffuse;
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
}`,ZM=`#include <common>
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
}`,$M=`uniform vec3 color;
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
}`,JM=`uniform float rotation;
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
}`,KM=`uniform vec3 diffuse;
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
}`,ee={alphahash_fragment:xy,alphahash_pars_fragment:yy,alphamap_fragment:vy,alphamap_pars_fragment:My,alphatest_fragment:Sy,alphatest_pars_fragment:by,aomap_fragment:wy,aomap_pars_fragment:Ay,batching_pars_vertex:Ty,batching_vertex:Ey,begin_vertex:Cy,beginnormal_vertex:Ry,bsdfs:Iy,iridescence_fragment:Py,bumpmap_pars_fragment:Ly,clipping_planes_fragment:Dy,clipping_planes_pars_fragment:Ny,clipping_planes_pars_vertex:Uy,clipping_planes_vertex:Fy,color_fragment:Oy,color_pars_fragment:By,color_pars_vertex:zy,color_vertex:ky,common:Vy,cube_uv_reflection_fragment:Gy,defaultnormal_vertex:Hy,displacementmap_pars_vertex:Wy,displacementmap_vertex:Xy,emissivemap_fragment:qy,emissivemap_pars_fragment:Yy,colorspace_fragment:Zy,colorspace_pars_fragment:$y,envmap_fragment:Jy,envmap_common_pars_fragment:Ky,envmap_pars_fragment:Qy,envmap_pars_vertex:jy,envmap_physical_pars_fragment:hv,envmap_vertex:tv,fog_vertex:ev,fog_pars_vertex:nv,fog_fragment:iv,fog_pars_fragment:sv,gradientmap_pars_fragment:rv,lightmap_pars_fragment:av,lights_lambert_fragment:ov,lights_lambert_pars_fragment:lv,lights_pars_begin:cv,lights_toon_fragment:uv,lights_toon_pars_fragment:dv,lights_phong_fragment:fv,lights_phong_pars_fragment:pv,lights_physical_fragment:mv,lights_physical_pars_fragment:gv,lights_fragment_begin:_v,lights_fragment_maps:xv,lights_fragment_end:yv,lightprobes_pars_fragment:vv,logdepthbuf_fragment:Mv,logdepthbuf_pars_fragment:Sv,logdepthbuf_pars_vertex:bv,logdepthbuf_vertex:wv,map_fragment:Av,map_pars_fragment:Tv,map_particle_fragment:Ev,map_particle_pars_fragment:Cv,metalnessmap_fragment:Rv,metalnessmap_pars_fragment:Iv,morphinstance_vertex:Pv,morphcolor_vertex:Lv,morphnormal_vertex:Dv,morphtarget_pars_vertex:Nv,morphtarget_vertex:Uv,normal_fragment_begin:Fv,normal_fragment_maps:Ov,normal_pars_fragment:Bv,normal_pars_vertex:zv,normal_vertex:kv,normalmap_pars_fragment:Vv,clearcoat_normal_fragment_begin:Gv,clearcoat_normal_fragment_maps:Hv,clearcoat_pars_fragment:Wv,iridescence_pars_fragment:Xv,opaque_fragment:qv,packing:Yv,premultiplied_alpha_fragment:Zv,project_vertex:$v,dithering_fragment:Jv,dithering_pars_fragment:Kv,roughnessmap_fragment:Qv,roughnessmap_pars_fragment:jv,shadowmap_pars_fragment:tM,shadowmap_pars_vertex:eM,shadowmap_vertex:nM,shadowmask_pars_fragment:iM,skinbase_vertex:sM,skinning_pars_vertex:rM,skinning_vertex:aM,skinnormal_vertex:oM,specularmap_fragment:lM,specularmap_pars_fragment:cM,tonemapping_fragment:hM,tonemapping_pars_fragment:uM,transmission_fragment:dM,transmission_pars_fragment:fM,uv_pars_fragment:pM,uv_pars_vertex:mM,uv_vertex:gM,worldpos_vertex:_M,background_vert:xM,background_frag:yM,backgroundCube_vert:vM,backgroundCube_frag:MM,cube_vert:SM,cube_frag:bM,depth_vert:wM,depth_frag:AM,distance_vert:TM,distance_frag:EM,equirect_vert:CM,equirect_frag:RM,linedashed_vert:IM,linedashed_frag:PM,meshbasic_vert:LM,meshbasic_frag:DM,meshlambert_vert:NM,meshlambert_frag:UM,meshmatcap_vert:FM,meshmatcap_frag:OM,meshnormal_vert:BM,meshnormal_frag:zM,meshphong_vert:kM,meshphong_frag:VM,meshphysical_vert:GM,meshphysical_frag:HM,meshtoon_vert:WM,meshtoon_frag:XM,points_vert:qM,points_frag:YM,shadow_vert:ZM,shadow_frag:$M,sprite_vert:JM,sprite_frag:KM},yt={common:{diffuse:{value:new ut(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:new Jt},alphaMap:{value:null},alphaMapTransform:{value:new Jt},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:new Jt}},envmap:{envMap:{value:null},envMapRotation:{value:new Jt},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:.98},dfgLUT:{value:null}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:new Jt}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:new Jt}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:new Jt},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:new Jt},normalScale:{value:new it(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:new Jt},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:new Jt}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:new Jt}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:new Jt}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:new ut(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},sunLights:{value:[],properties:{direction:{},color:{}}},sunLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},sunShadowMatrix:{value:[]},sunShadowCascade:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null},probesSH:{value:null},probesMin:{value:new I},probesMax:{value:new I},probesResolution:{value:new I}},points:{diffuse:{value:new ut(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:new Jt},alphaTest:{value:0},uvTransform:{value:new Jt}},sprite:{diffuse:{value:new ut(16777215)},opacity:{value:1},center:{value:new it(.5,.5)},rotation:{value:0},map:{value:null},mapTransform:{value:new Jt},alphaMap:{value:null},alphaMapTransform:{value:new Jt},alphaTest:{value:0}}},Hn={basic:{uniforms:ln([yt.common,yt.specularmap,yt.envmap,yt.aomap,yt.lightmap,yt.fog]),vertexShader:ee.meshbasic_vert,fragmentShader:ee.meshbasic_frag},lambert:{uniforms:ln([yt.common,yt.specularmap,yt.envmap,yt.aomap,yt.lightmap,yt.emissivemap,yt.bumpmap,yt.normalmap,yt.displacementmap,yt.fog,yt.lights,{emissive:{value:new ut(0)},envMapIntensity:{value:1}}]),vertexShader:ee.meshlambert_vert,fragmentShader:ee.meshlambert_frag},phong:{uniforms:ln([yt.common,yt.specularmap,yt.envmap,yt.aomap,yt.lightmap,yt.emissivemap,yt.bumpmap,yt.normalmap,yt.displacementmap,yt.fog,yt.lights,{emissive:{value:new ut(0)},specular:{value:new ut(1118481)},shininess:{value:30},envMapIntensity:{value:1}}]),vertexShader:ee.meshphong_vert,fragmentShader:ee.meshphong_frag},standard:{uniforms:ln([yt.common,yt.envmap,yt.aomap,yt.lightmap,yt.emissivemap,yt.bumpmap,yt.normalmap,yt.displacementmap,yt.roughnessmap,yt.metalnessmap,yt.fog,yt.lights,{emissive:{value:new ut(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:ee.meshphysical_vert,fragmentShader:ee.meshphysical_frag},toon:{uniforms:ln([yt.common,yt.aomap,yt.lightmap,yt.emissivemap,yt.bumpmap,yt.normalmap,yt.displacementmap,yt.gradientmap,yt.fog,yt.lights,{emissive:{value:new ut(0)}}]),vertexShader:ee.meshtoon_vert,fragmentShader:ee.meshtoon_frag},matcap:{uniforms:ln([yt.common,yt.bumpmap,yt.normalmap,yt.displacementmap,yt.fog,{matcap:{value:null}}]),vertexShader:ee.meshmatcap_vert,fragmentShader:ee.meshmatcap_frag},points:{uniforms:ln([yt.points,yt.fog]),vertexShader:ee.points_vert,fragmentShader:ee.points_frag},dashed:{uniforms:ln([yt.common,yt.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:ee.linedashed_vert,fragmentShader:ee.linedashed_frag},depth:{uniforms:ln([yt.common,yt.displacementmap]),vertexShader:ee.depth_vert,fragmentShader:ee.depth_frag},normal:{uniforms:ln([yt.common,yt.bumpmap,yt.normalmap,yt.displacementmap,{opacity:{value:1}}]),vertexShader:ee.meshnormal_vert,fragmentShader:ee.meshnormal_frag},sprite:{uniforms:ln([yt.sprite,yt.fog]),vertexShader:ee.sprite_vert,fragmentShader:ee.sprite_frag},background:{uniforms:{uvTransform:{value:new Jt},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:ee.background_vert,fragmentShader:ee.background_frag},backgroundCube:{uniforms:{envMap:{value:null},backgroundBlurriness:{value:0},backgroundIntensity:{value:1},backgroundRotation:{value:new Jt}},vertexShader:ee.backgroundCube_vert,fragmentShader:ee.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:ee.cube_vert,fragmentShader:ee.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:ee.equirect_vert,fragmentShader:ee.equirect_frag},distance:{uniforms:ln([yt.common,yt.displacementmap,{referencePosition:{value:new I},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:ee.distance_vert,fragmentShader:ee.distance_frag},shadow:{uniforms:ln([yt.lights,yt.fog,{color:{value:new ut(0)},opacity:{value:1}}]),vertexShader:ee.shadow_vert,fragmentShader:ee.shadow_frag}};Hn.physical={uniforms:ln([Hn.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:new Jt},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:new Jt},clearcoatNormalScale:{value:new it(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:new Jt},dispersion:{value:0},retroreflectivity:{value:0},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:new Jt},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:new Jt},sheen:{value:0},sheenColor:{value:new ut(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:new Jt},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:new Jt},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:new Jt},transmissionSamplerSize:{value:new it},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:new Jt},attenuationDistance:{value:0},attenuationColor:{value:new ut(0)},specularColor:{value:new ut(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:new Jt},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:new Jt},anisotropyVector:{value:new it},anisotropyMap:{value:null},anisotropyMapTransform:{value:new Jt}}]),vertexShader:ee.meshphysical_vert,fragmentShader:ee.meshphysical_frag};const No={r:0,b:0,g:0},QM=new Yt,Rm=new Jt;Rm.set(-1,0,0,0,1,0,0,0,1);function jM(s,t,e,n,i,r){const a=new ut(0);let o=i===!0?0:1,l,c,h=null,f=0,u=null;function d(x){let M=x.isScene===!0?x.background:null;if(M&&M.isTexture){const y=x.backgroundBlurriness>0;M=t.get(M,y)}return M}function p(x){let M=!1;const y=d(x);y===null?g(a,o):y&&y.isColor&&(g(y,1),M=!0);const w=s.xr.getEnvironmentBlendMode();w==="additive"?e.buffers.color.setClear(0,0,0,1,r):w==="alpha-blend"&&e.buffers.color.setClear(0,0,0,0,r),(s.autoClear||M)&&(e.buffers.depth.setTest(!0),e.buffers.depth.setMask(!0),e.buffers.color.setMask(!0),s.clear(s.autoClearColor,s.autoClearDepth,s.autoClearStencil))}function _(x,M){const y=d(M);y&&(y.isCubeTexture||y.mapping===br)?(c===void 0&&(c=new be(new Ni(1,1,1),new Fn({name:"BackgroundCubeMaterial",uniforms:vr(Hn.backgroundCube.uniforms),vertexShader:Hn.backgroundCube.vertexShader,fragmentShader:Hn.backgroundCube.fragmentShader,side:nn,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),c.geometry.deleteAttribute("normal"),c.geometry.deleteAttribute("uv"),c.onBeforeRender=function(w,b,E){this.matrixWorld.copyPosition(E.matrixWorld)},Object.defineProperty(c.material,"envMap",{get:function(){return this.uniforms.envMap.value}}),n.update(c)),c.material.uniforms.envMap.value=y,c.material.uniforms.backgroundBlurriness.value=M.backgroundBlurriness,c.material.uniforms.backgroundIntensity.value=M.backgroundIntensity,c.material.uniforms.backgroundRotation.value.setFromMatrix4(QM.makeRotationFromEuler(M.backgroundRotation)).transpose(),y.isCubeTexture&&y.isRenderTargetTexture===!1&&c.material.uniforms.backgroundRotation.value.premultiply(Rm),c.material.toneMapped=ae.getTransfer(y.colorSpace)!==me,(h!==y||f!==y.version||u!==s.toneMapping)&&(c.material.needsUpdate=!0,h=y,f=y.version,u=s.toneMapping),c.layers.enableAll(),x.unshift(c,c.geometry,c.material,0,0,null)):y&&y.isTexture&&(l===void 0&&(l=new be(new Ps(2,2),new Fn({name:"BackgroundMaterial",uniforms:vr(Hn.background.uniforms),vertexShader:Hn.background.vertexShader,fragmentShader:Hn.background.fragmentShader,side:Ii,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),l.geometry.deleteAttribute("normal"),Object.defineProperty(l.material,"map",{get:function(){return this.uniforms.t2D.value}}),n.update(l)),l.material.uniforms.t2D.value=y,l.material.uniforms.backgroundIntensity.value=M.backgroundIntensity,l.material.toneMapped=ae.getTransfer(y.colorSpace)!==me,y.matrixAutoUpdate===!0&&y.updateMatrix(),l.material.uniforms.uvTransform.value.copy(y.matrix),(h!==y||f!==y.version||u!==s.toneMapping)&&(l.material.needsUpdate=!0,h=y,f=y.version,u=s.toneMapping),l.layers.enableAll(),x.unshift(l,l.geometry,l.material,0,0,null))}function g(x,M){x.getRGB(No,Jp(s)),e.buffers.color.setClear(No.r,No.g,No.b,M,r)}function m(){c!==void 0&&(c.geometry.dispose(),c.material.dispose(),c=void 0),l!==void 0&&(l.geometry.dispose(),l.material.dispose(),l=void 0)}return{getClearColor:function(){return a},setClearColor:function(x,M=1){a.set(x),o=M,g(a,o)},getClearAlpha:function(){return o},setClearAlpha:function(x){o=x,g(a,o)},render:p,addToRenderList:_,dispose:m}}function tS(s,t){const e=s.getParameter(s.MAX_VERTEX_ATTRIBS),n={},i=u(null);let r=i,a=!1;function o(P,L,N,D,O){let V=!1;const z=f(P,D,N,L);r!==z&&(r=z,c(r.object)),V=d(P,D,N,O),V&&p(P,D,N,O),O!==null&&t.update(O,s.ELEMENT_ARRAY_BUFFER),(V||a)&&(a=!1,y(P,L,N,D),O!==null&&s.bindBuffer(s.ELEMENT_ARRAY_BUFFER,t.get(O).buffer))}function l(){return s.createVertexArray()}function c(P){return s.bindVertexArray(P)}function h(P){return s.deleteVertexArray(P)}function f(P,L,N,D){const O=D.wireframe===!0;let V=n[L.id];V===void 0&&(V={},n[L.id]=V);const z=P.isInstancedMesh===!0?P.id:0;let G=V[z];G===void 0&&(G={},V[z]=G);let X=G[N.id];X===void 0&&(X={},G[N.id]=X);let $=X[O];return $===void 0&&($=u(l()),X[O]=$),$}function u(P){const L=[],N=[],D=[];for(let O=0;O<e;O++)L[O]=0,N[O]=0,D[O]=0;return{geometry:null,program:null,wireframe:!1,newAttributes:L,enabledAttributes:N,attributeDivisors:D,object:P,attributes:{},index:null}}function d(P,L,N,D){const O=r.attributes,V=L.attributes;let z=0;const G=N.getAttributes();for(const X in G)if(G[X].location>=0){const Z=O[X];let ct=V[X];if(ct===void 0&&(X==="instanceMatrix"&&P.instanceMatrix&&(ct=P.instanceMatrix),X==="instanceColor"&&P.instanceColor&&(ct=P.instanceColor)),Z===void 0||Z.attribute!==ct||ct&&Z.data!==ct.data)return!0;z++}return r.attributesNum!==z||r.index!==D}function p(P,L,N,D){const O={},V=L.attributes;let z=0;const G=N.getAttributes();for(const X in G)if(G[X].location>=0){let Z=V[X];Z===void 0&&(X==="instanceMatrix"&&P.instanceMatrix&&(Z=P.instanceMatrix),X==="instanceColor"&&P.instanceColor&&(Z=P.instanceColor));const ct={};ct.attribute=Z,Z&&Z.data&&(ct.data=Z.data),O[X]=ct,z++}r.attributes=O,r.attributesNum=z,r.index=D}function _(){const P=r.newAttributes;for(let L=0,N=P.length;L<N;L++)P[L]=0}function g(P){m(P,0)}function m(P,L){const N=r.newAttributes,D=r.enabledAttributes,O=r.attributeDivisors;N[P]=1,D[P]===0&&(s.enableVertexAttribArray(P),D[P]=1),O[P]!==L&&(s.vertexAttribDivisor(P,L),O[P]=L)}function x(){const P=r.newAttributes,L=r.enabledAttributes;for(let N=0,D=L.length;N<D;N++)L[N]!==P[N]&&(s.disableVertexAttribArray(N),L[N]=0)}function M(P,L,N,D,O,V,z){z===!0?s.vertexAttribIPointer(P,L,N,O,V):s.vertexAttribPointer(P,L,N,D,O,V)}function y(P,L,N,D){_();const O=D.attributes,V=N.getAttributes(),z=L.defaultAttributeValues;for(const G in V){const X=V[G];if(X.location>=0){let $=O[G];if($===void 0&&(G==="instanceMatrix"&&P.instanceMatrix&&($=P.instanceMatrix),G==="instanceColor"&&P.instanceColor&&($=P.instanceColor)),$!==void 0){const Z=$.normalized,ct=$.itemSize,bt=t.get($);if(bt===void 0)continue;const $t=bt.buffer,Wt=bt.type,Qt=bt.bytesPerElement,K=Wt===s.INT||Wt===s.UNSIGNED_INT||$.gpuType===Vl;if($.isInterleavedBufferAttribute){const tt=$.data,ft=tt.stride,kt=$.offset;if(tt.isInstancedInterleavedBuffer){for(let Tt=0;Tt<X.locationSize;Tt++)m(X.location+Tt,tt.meshPerAttribute);P.isInstancedMesh!==!0&&D._maxInstanceCount===void 0&&(D._maxInstanceCount=tt.meshPerAttribute*tt.count)}else for(let Tt=0;Tt<X.locationSize;Tt++)g(X.location+Tt);s.bindBuffer(s.ARRAY_BUFFER,$t);for(let Tt=0;Tt<X.locationSize;Tt++)M(X.location+Tt,ct/X.locationSize,Wt,Z,ft*Qt,(kt+ct/X.locationSize*Tt)*Qt,K)}else{if($.isInstancedBufferAttribute){for(let tt=0;tt<X.locationSize;tt++)m(X.location+tt,$.meshPerAttribute);P.isInstancedMesh!==!0&&D._maxInstanceCount===void 0&&(D._maxInstanceCount=$.meshPerAttribute*$.count)}else for(let tt=0;tt<X.locationSize;tt++)g(X.location+tt);s.bindBuffer(s.ARRAY_BUFFER,$t);for(let tt=0;tt<X.locationSize;tt++)M(X.location+tt,ct/X.locationSize,Wt,Z,ct*Qt,ct/X.locationSize*tt*Qt,K)}}else if(z!==void 0){const Z=z[G];if(Z!==void 0)switch(Z.length){case 2:s.vertexAttrib2fv(X.location,Z);break;case 3:s.vertexAttrib3fv(X.location,Z);break;case 4:s.vertexAttrib4fv(X.location,Z);break;default:s.vertexAttrib1fv(X.location,Z)}}}}x()}function w(){T();for(const P in n){const L=n[P];for(const N in L){const D=L[N];for(const O in D){const V=D[O];for(const z in V)h(V[z].object),delete V[z];delete D[O]}}delete n[P]}}function b(P){if(n[P.id]===void 0)return;const L=n[P.id];for(const N in L){const D=L[N];for(const O in D){const V=D[O];for(const z in V)h(V[z].object),delete V[z];delete D[O]}}delete n[P.id]}function E(P){for(const L in n){const N=n[L];for(const D in N){const O=N[D];if(O[P.id]===void 0)continue;const V=O[P.id];for(const z in V)h(V[z].object),delete V[z];delete O[P.id]}}}function v(P){for(const L in n){const N=n[L],D=P.isInstancedMesh===!0?P.id:0,O=N[D];if(O!==void 0){for(const V in O){const z=O[V];for(const G in z)h(z[G].object),delete z[G];delete O[V]}delete N[D],Object.keys(N).length===0&&delete n[L]}}}function T(){C(),a=!0,r!==i&&(r=i,c(r.object))}function C(){i.geometry=null,i.program=null,i.wireframe=!1}return{setup:o,reset:T,resetDefaultState:C,dispose:w,releaseStatesOfGeometry:b,releaseStatesOfObject:v,releaseStatesOfProgram:E,initAttributes:_,enableAttribute:g,disableUnusedAttributes:x}}function eS(s,t,e){let n;function i(l){n=l}function r(l,c){s.drawArrays(n,l,c),e.update(c,n,1)}function a(l,c,h){h!==0&&(s.drawArraysInstanced(n,l,c,h),e.update(c,n,h))}function o(l,c,h){if(h===0)return;t.get("WEBGL_multi_draw").multiDrawArraysWEBGL(n,l,0,c,0,h);let u=0;for(let d=0;d<h;d++)u+=c[d];e.update(u,n,1)}this.setMode=i,this.render=r,this.renderInstances=a,this.renderMultiDraw=o}function nS(s,t,e,n){let i;function r(){if(i!==void 0)return i;if(t.has("EXT_texture_filter_anisotropic")===!0){const E=t.get("EXT_texture_filter_anisotropic");i=s.getParameter(E.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}else i=0;return i}function a(E){return!(E!==dn&&n.convert(E)!==s.getParameter(s.IMPLEMENTATION_COLOR_READ_FORMAT))}function o(E){const v=E===Zn&&(t.has("EXT_color_buffer_half_float")||t.has("EXT_color_buffer_float"));return!(E!==_n&&E!==un&&!v&&n.convert(E)!==s.getParameter(s.IMPLEMENTATION_COLOR_READ_TYPE))}function l(E){if(E==="highp"){if(s.getShaderPrecisionFormat(s.VERTEX_SHADER,s.HIGH_FLOAT).precision>0&&s.getShaderPrecisionFormat(s.FRAGMENT_SHADER,s.HIGH_FLOAT).precision>0)return"highp";E="mediump"}return E==="mediump"&&s.getShaderPrecisionFormat(s.VERTEX_SHADER,s.MEDIUM_FLOAT).precision>0&&s.getShaderPrecisionFormat(s.FRAGMENT_SHADER,s.MEDIUM_FLOAT).precision>0?"mediump":"lowp"}let c=e.precision!==void 0?e.precision:"highp";const h=l(c);h!==c&&(pt("WebGLRenderer:",c,"not supported, using",h,"instead."),c=h);const f=e.logarithmicDepthBuffer===!0,u=e.reversedDepthBuffer===!0&&t.has("EXT_clip_control");e.reversedDepthBuffer===!0&&u===!1&&pt("WebGLRenderer: Unable to use reversed depth buffer due to missing EXT_clip_control extension. Fallback to default depth buffer.");const d=s.getParameter(s.MAX_TEXTURE_IMAGE_UNITS),p=s.getParameter(s.MAX_VERTEX_TEXTURE_IMAGE_UNITS),_=s.getParameter(s.MAX_TEXTURE_SIZE),g=s.getParameter(s.MAX_CUBE_MAP_TEXTURE_SIZE),m=s.getParameter(s.MAX_VERTEX_ATTRIBS),x=s.getParameter(s.MAX_VERTEX_UNIFORM_VECTORS),M=s.getParameter(s.MAX_VARYING_VECTORS),y=s.getParameter(s.MAX_FRAGMENT_UNIFORM_VECTORS),w=s.getParameter(s.MAX_SAMPLES),b=s.getParameter(s.SAMPLES);return{isWebGL2:!0,getMaxAnisotropy:r,getMaxPrecision:l,textureFormatReadable:a,textureTypeReadable:o,precision:c,logarithmicDepthBuffer:f,reversedDepthBuffer:u,maxTextures:d,maxVertexTextures:p,maxTextureSize:_,maxCubemapSize:g,maxAttributes:m,maxVertexUniforms:x,maxVaryings:M,maxFragmentUniforms:y,maxSamples:w,samples:b}}function iS(s){const t=this;let e=null,n=0,i=!1,r=!1;const a=new Mi,o=new Jt,l={value:null,needsUpdate:!1};this.uniform=l,this.numPlanes=0,this.numIntersection=0,this.init=function(f,u){const d=f.length!==0||u||n!==0||i;return i=u,n=f.length,d},this.beginShadows=function(){r=!0,h(null)},this.endShadows=function(){r=!1},this.setGlobalState=function(f,u){e=h(f,u,0)},this.setState=function(f,u,d){const p=f.clippingPlanes,_=f.clipIntersection,g=f.clipShadows,m=s.get(f);if(!i||p===null||p.length===0||r&&!g)r?h(null):c();else{const x=r?0:n,M=x*4;let y=m.clippingState||null;l.value=y,y=h(p,u,M,d);for(let w=0;w!==M;++w)y[w]=e[w];m.clippingState=y,this.numIntersection=_?this.numPlanes:0,this.numPlanes+=x}};function c(){l.value!==e&&(l.value=e,l.needsUpdate=n>0),t.numPlanes=n,t.numIntersection=0}function h(f,u,d,p){const _=f!==null?f.length:0;let g=null;if(_!==0){if(g=l.value,p!==!0||g===null){const m=d+_*4,x=u.matrixWorldInverse;o.getNormalMatrix(x),(g===null||g.length<m)&&(g=new Float32Array(m));for(let M=0,y=d;M!==_;++M,y+=4)a.copy(f[M]).applyMatrix4(x,o),a.normal.toArray(g,y),g[y+3]=a.constant}l.value=g,l.needsUpdate=!0}return t.numPlanes=_,t.numIntersection=0,g}}const or=4,sS=6,rS=20,aS=256,Gr=new Va,mf=new ut;let dh=null,fh=0,ph=0,mh=!1;const oS=new I,gs=new I;class Nh{constructor(t){this._renderer=t,this._pingPongRenderTarget=null,this._lodMax=0,this._cubeSize=0,this._sizeLods=[],this._lodMeshes=[],this._backgroundBox=null,this._cubemapMaterial=null,this._equirectMaterial=null,this._blurMaterial=null,this._ggxMaterial=null}fromScene(t,e=0,n=.1,i=100,r={}){const{size:a=256,position:o=oS}=r;dh=this._renderer.getRenderTarget(),fh=this._renderer.getActiveCubeFace(),ph=this._renderer.getActiveMipmapLevel(),mh=this._renderer.xr.enabled,this._renderer.xr.enabled=!1,this._setSize(a);const l=this._allocateTargets();return l.depthBuffer=!0,this._sceneToCubeUV(t,n,i,l,o),e>0&&this._blur(l,0,0,e),this._applyPMREM(l),this._cleanup(l),l}fromEquirectangular(t,e=null){return this._fromTexture(t,e)}fromCubemap(t,e=null){return this._fromTexture(t,e)}compileCubemapShader(){this._cubemapMaterial===null&&(this._cubemapMaterial=xf(),this._compileMaterial(this._cubemapMaterial))}compileEquirectangularShader(){this._equirectMaterial===null&&(this._equirectMaterial=_f(),this._compileMaterial(this._equirectMaterial))}dispose(){this._dispose(),this._cubemapMaterial!==null&&this._cubemapMaterial.dispose(),this._equirectMaterial!==null&&this._equirectMaterial.dispose(),this._backgroundBox!==null&&(this._backgroundBox.geometry.dispose(),this._backgroundBox.material.dispose())}_setSize(t){this._lodMax=Math.floor(Math.log2(t)),this._cubeSize=Math.pow(2,this._lodMax)}_dispose(){this._blurMaterial!==null&&this._blurMaterial.dispose(),this._ggxMaterial!==null&&this._ggxMaterial.dispose(),this._pingPongRenderTarget!==null&&this._pingPongRenderTarget.dispose();for(let t=0;t<this._lodMeshes.length;t++)this._lodMeshes[t].geometry.dispose()}_cleanup(t){this._renderer.setRenderTarget(dh,fh,ph),this._renderer.xr.enabled=mh,t.scissorTest=!1,nr(t,0,0,t.width,t.height)}_fromTexture(t,e){t.mapping===li||t.mapping===$i?this._setSize(t.image.length===0?16:t.image[0].width||t.image[0].image.width):this._setSize(t.image.width/4),dh=this._renderer.getRenderTarget(),fh=this._renderer.getActiveCubeFace(),ph=this._renderer.getActiveMipmapLevel(),mh=this._renderer.xr.enabled,this._renderer.xr.enabled=!1;const n=e||this._allocateTargets();return this._textureToCubeUV(t,n),this._applyPMREM(n),this._cleanup(n),n}_allocateTargets(){const t=3*Math.max(this._cubeSize,112),e=4*this._cubeSize,n={magFilter:Ae,minFilter:Ae,generateMipmaps:!1,type:Zn,format:dn,colorSpace:va,depthBuffer:!1},i=gf(t,e,n);if(this._pingPongRenderTarget===null||this._pingPongRenderTarget.width!==t||this._pingPongRenderTarget.height!==e){this._pingPongRenderTarget!==null&&this._dispose(),this._pingPongRenderTarget=gf(t,e,n);const{_lodMax:r}=this;({lodMeshes:this._lodMeshes,sizeLods:this._sizeLods}=lS(r)),this._blurMaterial=hS(r,t,e),this._ggxMaterial=cS(r,t,e)}return i}_compileMaterial(t){const e=new be(new Zt,t);this._renderer.compile(e,Gr)}_sceneToCubeUV(t,e,n,i,r){const l=new Xe(90,1,e,n),c=[1,-1,1,1,1,1],h=[1,1,1,-1,-1,-1],f=this._renderer,u=f.autoClear,d=f.toneMapping;f.getClearColor(mf),f.toneMapping=Yn,f.autoClear=!1,f.state.buffers.depth.getReversed()&&(f.setRenderTarget(i),f.clearDepth(),f.setRenderTarget(null)),this._backgroundBox===null&&(this._backgroundBox=new be(new Ni,new hi({name:"PMREM.Background",side:nn,depthWrite:!1,depthTest:!1})));const _=this._backgroundBox,g=_.material;let m=!1;const x=t.background;x?x.isColor&&(g.color.copy(x),t.background=null,m=!0):(g.color.copy(mf),m=!0);for(let M=0;M<6;M++){const y=M%3;y===0?(l.up.set(0,c[M],0),l.position.set(r.x,r.y,r.z),l.lookAt(r.x+h[M],r.y,r.z)):y===1?(l.up.set(0,0,c[M]),l.position.set(r.x,r.y,r.z),l.lookAt(r.x,r.y+h[M],r.z)):(l.up.set(0,c[M],0),l.position.set(r.x,r.y,r.z),l.lookAt(r.x,r.y,r.z+h[M]));const w=this._cubeSize;nr(i,y*w,M>2?w:0,w,w),f.setRenderTarget(i),m&&f.render(_,l),f.render(t,l)}f.toneMapping=d,f.autoClear=u,t.background=x}_textureToCubeUV(t,e){const n=this._renderer,i=t.mapping===li||t.mapping===$i;i?(this._cubemapMaterial===null&&(this._cubemapMaterial=xf()),this._cubemapMaterial.uniforms.flipEnvMap.value=t.isRenderTargetTexture===!1?-1:1):this._equirectMaterial===null&&(this._equirectMaterial=_f());const r=i?this._cubemapMaterial:this._equirectMaterial,a=this._lodMeshes[0];a.material=r;const o=r.uniforms;o.envMap.value=t;const l=this._cubeSize;nr(e,0,0,3*l,2*l),n.setRenderTarget(e),n.render(a,Gr)}_applyPMREM(t){const e=this._renderer,n=e.autoClear;e.autoClear=!1;const i=this._lodMeshes.length;for(let r=1;r<i;r++)this._applyGGXFilter(t,r-1,r);e.autoClear=n}_applyGGXFilter(t,e,n){const i=this._renderer,r=this._pingPongRenderTarget,a=this._ggxMaterial,o=this._lodMeshes[n];o.material=a;const l=a.uniforms,c=n/(this._lodMeshes.length-1),h=e/(this._lodMeshes.length-1),f=Math.sqrt(c*c-h*h),u=c*1.25,d=f*u,{_lodMax:p}=this,_=this._sizeLods[n],g=3*_*(n>p-or?n-p+or:0),m=4*(this._cubeSize-_);l.envMap.value=t.texture,l.roughness.value=d,l.mipInt.value=p-e,nr(r,g,m,3*_,2*_),i.setRenderTarget(r),i.render(o,Gr),l.envMap.value=r.texture,l.roughness.value=0,l.mipInt.value=p-n,nr(t,g,m,3*_,2*_),i.setRenderTarget(t),i.render(o,Gr)}_blur(t,e,n,i){const r=this._pingPongRenderTarget,a=Math.min(i,Math.PI)/Math.SQRT2;this._blurPass(t,r,e,n,a),this._blurPass(r,t,n,n,a)}_blurPass(t,e,n,i,r){const a=this._renderer,o=this._blurMaterial,l=this._lodMeshes[i];l.material=o;const c=o.uniforms;c.envMap.value=t.texture,c.sigma.value=r,c.mipInt.value=this._lodMax-n;const h=this._sizeLods[i],f=3*h*(i>this._lodMax-or?i-this._lodMax+or:0),u=4*(this._cubeSize-h);nr(e,f,u,3*h,2*h),a.setRenderTarget(e),a.render(l,Gr)}}function lS(s){const t=[],e=[];let n=s;const i=s-or+1+sS;for(let r=0;r<i;r++){const a=Math.pow(2,n);t.push(a);const o=1/(a-2),l=-o,c=1+o,h=[l,l,c,l,c,c,l,l,c,c,l,c],f=6,u=6,d=3,p=new Float32Array(d*u*f),_=new Float32Array(d*u*f);for(let m=0;m<f;m++){const x=m%3*2/3-1,M=m>2?0:-1,y=[x,M,0,x+2/3,M,0,x+2/3,M+1,0,x,M,0,x+2/3,M+1,0,x,M+1,0];p.set(y,d*u*m);for(let w=0;w<u;w++){const b=h[w*2]*2-1,E=h[w*2+1]*2-1;m===0?gs.set(1,E,b):m===1?gs.set(-b,1,-E):m===2?gs.set(-b,E,1):m===3?gs.set(-1,E,-b):m===4?gs.set(-b,-1,E):gs.set(b,E,-1),gs.toArray(_,(m*u+w)*d)}}const g=new Zt;g.setAttribute("position",new ue(p,d)),g.setAttribute("outputDirection",new ue(_,d)),e.push(new be(g,null)),n>or&&n--}return{lodMeshes:e,sizeLods:t}}function gf(s,t,e){const n=new Mn(s,t,e);return n.texture.mapping=br,n.texture.name="PMREM.cubeUv",n.scissorTest=!0,n}function nr(s,t,e,n,i){s.viewport.set(t,e,n,i),s.scissor.set(t,e,n,i)}function cS(s,t,e){return new Fn({name:"PMREMGGXConvolution",defines:{GGX_SAMPLES:aS,CUBEUV_TEXEL_WIDTH:1/t,CUBEUV_TEXEL_HEIGHT:1/e,CUBEUV_MAX_MIP:`${s}.0`},uniforms:{envMap:{value:null},roughness:{value:0},mipInt:{value:0}},vertexShader:Sc(),fragmentShader:`

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
		`,blending:oi,depthTest:!1,depthWrite:!1})}function hS(s,t,e){return new Fn({name:"SphericalGaussianBlur",defines:{SAMPLES:rS,CUBEUV_TEXEL_WIDTH:1/t,CUBEUV_TEXEL_HEIGHT:1/e,CUBEUV_MAX_MIP:`${s}.0`},uniforms:{envMap:{value:null},sigma:{value:0},mipInt:{value:0}},vertexShader:Sc(),fragmentShader:`

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
		`,blending:oi,depthTest:!1,depthWrite:!1})}function _f(){return new Fn({name:"EquirectangularToCubeUV",uniforms:{envMap:{value:null}},vertexShader:Sc(),fragmentShader:`

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
		`,blending:oi,depthTest:!1,depthWrite:!1})}function xf(){return new Fn({name:"CubemapToCubeUV",uniforms:{envMap:{value:null},flipEnvMap:{value:-1}},vertexShader:Sc(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			uniform float flipEnvMap;

			varying vec3 vOutputDirection;

			uniform samplerCube envMap;

			void main() {

				gl_FragColor = textureCube( envMap, vec3( flipEnvMap * vOutputDirection.x, vOutputDirection.yz ) );

			}
		`,blending:oi,depthTest:!1,depthWrite:!1})}function Sc(){return`

		precision mediump float;
		precision mediump int;

		attribute vec3 outputDirection;

		varying vec3 vOutputDirection;

		void main() {

			vOutputDirection = outputDirection;
			gl_Position = vec4( position, 1.0 );

		}
	`}class Uu extends Mn{constructor(t=1,e={}){super(t,t,e),this.isWebGLCubeRenderTarget=!0;const n={width:t,height:t,depth:1},i=[n,n,n,n,n,n];this.texture=new Fa(i),this._setTextureOptions(e),this.texture.isRenderTargetTexture=!0}fromEquirectangularTexture(t,e){this.texture.type=e.type,this.texture.colorSpace=e.colorSpace,this.texture.generateMipmaps=e.generateMipmaps,this.texture.minFilter=e.minFilter,this.texture.magFilter=e.magFilter;const n={uniforms:{tEquirect:{value:null}},vertexShader:`

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
			`},i=new Ni(5,5,5),r=new Fn({name:"CubemapFromEquirect",uniforms:vr(n.uniforms),vertexShader:n.vertexShader,fragmentShader:n.fragmentShader,side:nn,blending:oi});r.uniforms.tEquirect.value=e;const a=new be(i,r),o=e.minFilter;return e.minFilter===ri&&(e.minFilter=Ae),new ym(1,10,this).update(t,a),e.minFilter=o,a.geometry.dispose(),a.material.dispose(),this}clear(t,e=!0,n=!0,i=!0){const r=t.getRenderTarget();for(let a=0;a<6;a++)t.setRenderTarget(this,a),t.clear(e,n,i);t.setRenderTarget(r)}}function uS(s){let t=new WeakMap,e=new WeakMap,n=null;function i(u,d=!1){return u==null?null:d?a(u):r(u)}function r(u){if(u&&u.isTexture){const d=u.mapping;if(d===na||d===ia)if(t.has(u)){const p=t.get(u).texture;return o(p,u.mapping)}else{const p=u.image;if(p&&p.height>0){const _=new Uu(p.height);return _.fromEquirectangularTexture(s,u),t.set(u,_),u.addEventListener("dispose",c),o(_.texture,u.mapping)}else return null}}return u}function a(u){if(u&&u.isTexture){const d=u.mapping,p=d===na||d===ia,_=d===li||d===$i;if(p||_){let g=e.get(u);const m=g!==void 0?g.texture.pmremVersion:0;if(u.isRenderTargetTexture&&u.pmremVersion!==m)return n===null&&(n=new Nh(s)),g=p?n.fromEquirectangular(u,g):n.fromCubemap(u,g),g.texture.pmremVersion=u.pmremVersion,e.set(u,g),g.texture;if(g!==void 0)return g.texture;{const x=u.image;return p&&x&&x.height>0||_&&x&&l(x)?(n===null&&(n=new Nh(s)),g=p?n.fromEquirectangular(u):n.fromCubemap(u),g.texture.pmremVersion=u.pmremVersion,e.set(u,g),u.addEventListener("dispose",h),g.texture):null}}}return u}function o(u,d){return d===na?u.mapping=li:d===ia&&(u.mapping=$i),u}function l(u){let d=0;const p=6;for(let _=0;_<p;_++)u[_]!==void 0&&d++;return d===p}function c(u){const d=u.target;d.removeEventListener("dispose",c);const p=t.get(d);p!==void 0&&(t.delete(d),p.dispose())}function h(u){const d=u.target;d.removeEventListener("dispose",h);const p=e.get(d);p!==void 0&&(e.delete(d),p.dispose())}function f(){t=new WeakMap,e=new WeakMap,n!==null&&(n.dispose(),n=null)}return{get:i,dispose:f}}function dS(s){const t={};function e(n){if(t[n]!==void 0)return t[n];const i=s.getExtension(n);return t[n]=i,i}return{has:function(n){return e(n)!==null},init:function(){e("EXT_color_buffer_float"),e("WEBGL_clip_cull_distance"),e("OES_texture_float_linear"),e("EXT_color_buffer_half_float"),e("WEBGL_multisampled_render_to_texture"),e("WEBGL_render_shared_exponent")},get:function(n){const i=e(n);return i===null&&Ci("WebGLRenderer: "+n+" extension not supported."),i}}}function fS(s,t,e,n){const i={},r=new WeakMap;function a(f){const u=f.target;u.index!==null&&t.remove(u.index);for(const p in u.attributes)t.remove(u.attributes[p]);u.removeEventListener("dispose",a),delete i[u.id];const d=r.get(u);d&&(t.remove(d),r.delete(u)),n.releaseStatesOfGeometry(u),u.isInstancedBufferGeometry===!0&&delete u._maxInstanceCount,e.memory.geometries--}function o(f,u){return i[u.id]===!0||(u.addEventListener("dispose",a),i[u.id]=!0,e.memory.geometries++),u}function l(f){const u=f.attributes;for(const d in u)t.update(u[d],s.ARRAY_BUFFER)}function c(f){const u=[],d=f.index,p=f.attributes.position;let _=0;if(p===void 0)return;if(d!==null){const x=d.array;_=d.version;for(let M=0,y=x.length;M<y;M+=3){const w=x[M+0],b=x[M+1],E=x[M+2];u.push(w,b,b,E,E,w)}}else{const x=p.array;_=p.version;for(let M=0,y=x.length/3-1;M<y;M+=3){const w=M+0,b=M+1,E=M+2;u.push(w,b,b,E,E,w)}}const g=new(p.count>=65535?lu:ou)(u,1);g.version=_;const m=r.get(f);m&&t.remove(m),r.set(f,g)}function h(f){const u=r.get(f);if(u){const d=f.index;d!==null&&u.version<d.version&&c(f)}else c(f);return r.get(f)}return{get:o,update:l,getWireframeAttribute:h}}function pS(s,t,e){let n;function i(f){n=f}let r,a;function o(f){r=f.type,a=f.bytesPerElement}function l(f,u){s.drawElements(n,u,r,f*a),e.update(u,n,1)}function c(f,u,d){d!==0&&(s.drawElementsInstanced(n,u,r,f*a,d),e.update(u,n,d))}function h(f,u,d){if(d===0)return;t.get("WEBGL_multi_draw").multiDrawElementsWEBGL(n,u,0,r,f,0,d);let _=0;for(let g=0;g<d;g++)_+=u[g];e.update(_,n,1)}this.setMode=i,this.setIndex=o,this.render=l,this.renderInstances=c,this.renderMultiDraw=h}function mS(s){const t={geometries:0,textures:0},e={frame:0,calls:0,triangles:0,points:0,lines:0};function n(r,a,o){switch(e.calls++,a){case s.TRIANGLES:e.triangles+=o*(r/3);break;case s.LINES:e.lines+=o*(r/2);break;case s.LINE_STRIP:e.lines+=o*(r-1);break;case s.LINE_LOOP:e.lines+=o*r;break;case s.POINTS:e.points+=o*r;break;default:Nt("WebGLInfo: Unknown draw mode:",a);break}}function i(){e.calls=0,e.triangles=0,e.points=0,e.lines=0}return{memory:t,render:e,programs:null,autoReset:!0,reset:i,update:n}}function gS(s,t,e){const n=new WeakMap,i=new xe;function r(a,o,l){const c=a.morphTargetInfluences,h=o.morphAttributes.position||o.morphAttributes.normal||o.morphAttributes.color,f=h!==void 0?h.length:0;let u=n.get(o);if(u===void 0||u.count!==f){let C=function(){v.dispose(),n.delete(o),o.removeEventListener("dispose",C)};var d=C;u!==void 0&&u.texture.dispose();const p=o.morphAttributes.position!==void 0,_=o.morphAttributes.normal!==void 0,g=o.morphAttributes.color!==void 0,m=o.morphAttributes.position||[],x=o.morphAttributes.normal||[],M=o.morphAttributes.color||[];let y=0;p===!0&&(y=1),_===!0&&(y=2),g===!0&&(y=3);let w=o.attributes.position.count*y,b=1;w>t.maxTextureSize&&(b=Math.ceil(w/t.maxTextureSize),w=t.maxTextureSize);const E=new Float32Array(w*b*4*f),v=new Kl(E,w,b,f);v.type=un,v.needsUpdate=!0;const T=y*4;for(let P=0;P<f;P++){const L=m[P],N=x[P],D=M[P],O=w*b*4*P;for(let V=0;V<L.count;V++){const z=V*T;p===!0&&(i.fromBufferAttribute(L,V),E[O+z+0]=i.x,E[O+z+1]=i.y,E[O+z+2]=i.z,E[O+z+3]=0),_===!0&&(i.fromBufferAttribute(N,V),E[O+z+4]=i.x,E[O+z+5]=i.y,E[O+z+6]=i.z,E[O+z+7]=0),g===!0&&(i.fromBufferAttribute(D,V),E[O+z+8]=i.x,E[O+z+9]=i.y,E[O+z+10]=i.z,E[O+z+11]=D.itemSize===4?i.w:1)}}u={count:f,texture:v,size:new it(w,b)},n.set(o,u),o.addEventListener("dispose",C)}if(a.isInstancedMesh===!0&&a.morphTexture!==null)l.getUniforms().setValue(s,"morphTexture",a.morphTexture,e);else{let p=0;for(let g=0;g<c.length;g++)p+=c[g];const _=o.morphTargetsRelative?1:1-p;l.getUniforms().setValue(s,"morphTargetBaseInfluence",_),l.getUniforms().setValue(s,"morphTargetInfluences",c)}l.getUniforms().setValue(s,"morphTargetsTexture",u.texture,e),l.getUniforms().setValue(s,"morphTargetsTextureSize",u.size)}return{update:r}}function _S(s,t,e,n,i){let r=new WeakMap;function a(c){const h=i.render.frame,f=c.geometry,u=t.get(c,f);if(r.get(u)!==h&&(t.update(u),r.set(u,h)),c.isInstancedMesh&&(c.hasEventListener("dispose",l)===!1&&c.addEventListener("dispose",l),r.get(c)!==h&&(e.update(c.instanceMatrix,s.ARRAY_BUFFER),c.instanceColor!==null&&e.update(c.instanceColor,s.ARRAY_BUFFER),r.set(c,h))),c.isSkinnedMesh){const d=c.skeleton;r.get(d)!==h&&(d.update(),r.set(d,h))}return u}function o(){r=new WeakMap}function l(c){const h=c.target;h.removeEventListener("dispose",l),n.releaseStatesOfObject(h),e.remove(h.instanceMatrix),h.instanceColor!==null&&e.remove(h.instanceColor)}return{update:a,dispose:o}}const xS={[Wh]:"LINEAR_TONE_MAPPING",[Xh]:"REINHARD_TONE_MAPPING",[qh]:"CINEON_TONE_MAPPING",[zl]:"ACES_FILMIC_TONE_MAPPING",[Zh]:"AGX_TONE_MAPPING",[$h]:"NEUTRAL_TONE_MAPPING",[Yh]:"CUSTOM_TONE_MAPPING"};function yS(s,t,e,n,i,r){const a=new Mn(t,e,{type:s,depthBuffer:i,stencilBuffer:r,samples:n?4:0,storeMultisampledDepthBuffer:!1,storeMultisampledStencilBuffer:!1,resolveDepthBuffer:!1,resolveStencilBuffer:!1});let o=null,l=null;const c=new Zt;c.setAttribute("position",new Mt([-1,3,0,-1,-1,0,3,-1,0],3)),c.setAttribute("uv",new Mt([0,2,0,0,2,0],2));const h=new vu({uniforms:{tDiffuse:{value:null}},vertexShader:`
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
			}`,depthTest:!1,depthWrite:!1}),f=new be(c,h),u=new Va(-1,1,1,-1,0,1);let d=null,p=null,_=!1,g,m=null,x=[],M=!1;this.setSize=function(y,w){a.setSize(y,w),o!==null&&o.setSize(y,w),l!==null&&l.setSize(y,w);for(let b=0;b<x.length;b++){const E=x[b];E.setSize&&E.setSize(y,w)}},this.setEffects=function(y){x=y,M=x.length>0&&x[0].isRenderPass===!0;const w=a.width,b=a.height;x.length>0&&o===null&&(o=new Mn(w,b,{type:Zn,depthBuffer:!1,stencilBuffer:!1}),l=new Mn(w,b,{type:Zn,depthBuffer:!1,stencilBuffer:!1}));for(let E=0;E<x.length;E++){const v=x[E];v.setSize&&v.setSize(w,b)}},this.begin=function(y,w){if(_||y.toneMapping===Yn&&x.length===0)return!1;if(m=w,w!==null){const b=w.width,E=w.height;(a.width!==b||a.height!==E)&&this.setSize(b,E)}return M===!1&&y.setRenderTarget(a),g=y.toneMapping,y.toneMapping=Yn,!0},this.hasRenderPass=function(){return M},this.end=function(y,w){y.toneMapping=g,_=!0;let b=a,E=o;for(let v=0;v<x.length;v++){const T=x[v];T.enabled!==!1&&(T.render(y,E,b,w),T.needsSwap!==!1&&(b=E,E=E===o?l:o))}if(d!==y.outputColorSpace||p!==y.toneMapping){d=y.outputColorSpace,p=y.toneMapping,h.defines={},ae.getTransfer(d)===me&&(h.defines.SRGB_TRANSFER="");const v=xS[p];v&&(h.defines[v]=""),h.needsUpdate=!0}h.uniforms.tDiffuse.value=b.texture,y.setRenderTarget(m),y.render(f,u),m=null,_=!1},this.isCompositing=function(){return _},this.dispose=function(){a.dispose(),o!==null&&o.dispose(),l!==null&&l.dispose(),c.dispose(),h.dispose()}}const Im=new Ce,Uh=new xr(1,1),Pm=new Kl,Lm=new Ql,Dm=new Fa,yf=[],vf=[],Mf=new Float32Array(16),Sf=new Float32Array(9),bf=new Float32Array(4);function Cr(s,t,e){const n=s[0];if(n<=0||n>0)return s;const i=t*e;let r=yf[i];if(r===void 0&&(r=new Float32Array(i),yf[i]=r),t!==0){n.toArray(r,0);for(let a=1,o=0;a!==t;++a)o+=e,s[a].toArray(r,o)}return r}function Ge(s,t){if(s.length!==t.length)return!1;for(let e=0,n=s.length;e<n;e++)if(s[e]!==t[e])return!1;return!0}function He(s,t){for(let e=0,n=t.length;e<n;e++)s[e]=t[e]}function bc(s,t){let e=vf[t];e===void 0&&(e=new Int32Array(t),vf[t]=e);for(let n=0;n!==t;++n)e[n]=s.allocateTextureUnit();return e}function vS(s,t){const e=this.cache;e[0]!==t&&(s.uniform1f(this.addr,t),e[0]=t)}function MS(s,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y)&&(s.uniform2f(this.addr,t.x,t.y),e[0]=t.x,e[1]=t.y);else{if(Ge(e,t))return;s.uniform2fv(this.addr,t),He(e,t)}}function SS(s,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z)&&(s.uniform3f(this.addr,t.x,t.y,t.z),e[0]=t.x,e[1]=t.y,e[2]=t.z);else if(t.r!==void 0)(e[0]!==t.r||e[1]!==t.g||e[2]!==t.b)&&(s.uniform3f(this.addr,t.r,t.g,t.b),e[0]=t.r,e[1]=t.g,e[2]=t.b);else{if(Ge(e,t))return;s.uniform3fv(this.addr,t),He(e,t)}}function bS(s,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z||e[3]!==t.w)&&(s.uniform4f(this.addr,t.x,t.y,t.z,t.w),e[0]=t.x,e[1]=t.y,e[2]=t.z,e[3]=t.w);else{if(Ge(e,t))return;s.uniform4fv(this.addr,t),He(e,t)}}function wS(s,t){const e=this.cache,n=t.elements;if(n===void 0){if(Ge(e,t))return;s.uniformMatrix2fv(this.addr,!1,t),He(e,t)}else{if(Ge(e,n))return;bf.set(n),s.uniformMatrix2fv(this.addr,!1,bf),He(e,n)}}function AS(s,t){const e=this.cache,n=t.elements;if(n===void 0){if(Ge(e,t))return;s.uniformMatrix3fv(this.addr,!1,t),He(e,t)}else{if(Ge(e,n))return;Sf.set(n),s.uniformMatrix3fv(this.addr,!1,Sf),He(e,n)}}function TS(s,t){const e=this.cache,n=t.elements;if(n===void 0){if(Ge(e,t))return;s.uniformMatrix4fv(this.addr,!1,t),He(e,t)}else{if(Ge(e,n))return;Mf.set(n),s.uniformMatrix4fv(this.addr,!1,Mf),He(e,n)}}function ES(s,t){const e=this.cache;e[0]!==t&&(s.uniform1i(this.addr,t),e[0]=t)}function CS(s,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y)&&(s.uniform2i(this.addr,t.x,t.y),e[0]=t.x,e[1]=t.y);else{if(Ge(e,t))return;s.uniform2iv(this.addr,t),He(e,t)}}function RS(s,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z)&&(s.uniform3i(this.addr,t.x,t.y,t.z),e[0]=t.x,e[1]=t.y,e[2]=t.z);else{if(Ge(e,t))return;s.uniform3iv(this.addr,t),He(e,t)}}function IS(s,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z||e[3]!==t.w)&&(s.uniform4i(this.addr,t.x,t.y,t.z,t.w),e[0]=t.x,e[1]=t.y,e[2]=t.z,e[3]=t.w);else{if(Ge(e,t))return;s.uniform4iv(this.addr,t),He(e,t)}}function PS(s,t){const e=this.cache;e[0]!==t&&(s.uniform1ui(this.addr,t),e[0]=t)}function LS(s,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y)&&(s.uniform2ui(this.addr,t.x,t.y),e[0]=t.x,e[1]=t.y);else{if(Ge(e,t))return;s.uniform2uiv(this.addr,t),He(e,t)}}function DS(s,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z)&&(s.uniform3ui(this.addr,t.x,t.y,t.z),e[0]=t.x,e[1]=t.y,e[2]=t.z);else{if(Ge(e,t))return;s.uniform3uiv(this.addr,t),He(e,t)}}function NS(s,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z||e[3]!==t.w)&&(s.uniform4ui(this.addr,t.x,t.y,t.z,t.w),e[0]=t.x,e[1]=t.y,e[2]=t.z,e[3]=t.w);else{if(Ge(e,t))return;s.uniform4uiv(this.addr,t),He(e,t)}}function US(s,t,e){const n=this.cache,i=e.allocateTextureUnit();n[0]!==i&&(s.uniform1i(this.addr,i),n[0]=i);let r;this.type===s.SAMPLER_2D_SHADOW?(Uh.compareFunction=e.isReversedDepthBuffer()?$l:Zl,r=Uh):r=Im,e.setTexture2D(t||r,i)}function FS(s,t,e){const n=this.cache,i=e.allocateTextureUnit();n[0]!==i&&(s.uniform1i(this.addr,i),n[0]=i),e.setTexture3D(t||Lm,i)}function OS(s,t,e){const n=this.cache,i=e.allocateTextureUnit();n[0]!==i&&(s.uniform1i(this.addr,i),n[0]=i),e.setTextureCube(t||Dm,i)}function BS(s,t,e){const n=this.cache,i=e.allocateTextureUnit();n[0]!==i&&(s.uniform1i(this.addr,i),n[0]=i),e.setTexture2DArray(t||Pm,i)}function zS(s){switch(s){case 5126:return vS;case 35664:return MS;case 35665:return SS;case 35666:return bS;case 35674:return wS;case 35675:return AS;case 35676:return TS;case 5124:case 35670:return ES;case 35667:case 35671:return CS;case 35668:case 35672:return RS;case 35669:case 35673:return IS;case 5125:return PS;case 36294:return LS;case 36295:return DS;case 36296:return NS;case 35678:case 36198:case 36298:case 36306:case 35682:return US;case 35679:case 36299:case 36307:return FS;case 35680:case 36300:case 36308:case 36293:return OS;case 36289:case 36303:case 36311:case 36292:return BS}}function kS(s,t){s.uniform1fv(this.addr,t)}function VS(s,t){const e=Cr(t,this.size,2);s.uniform2fv(this.addr,e)}function GS(s,t){const e=Cr(t,this.size,3);s.uniform3fv(this.addr,e)}function HS(s,t){const e=Cr(t,this.size,4);s.uniform4fv(this.addr,e)}function WS(s,t){const e=Cr(t,this.size,4);s.uniformMatrix2fv(this.addr,!1,e)}function XS(s,t){const e=Cr(t,this.size,9);s.uniformMatrix3fv(this.addr,!1,e)}function qS(s,t){const e=Cr(t,this.size,16);s.uniformMatrix4fv(this.addr,!1,e)}function YS(s,t){s.uniform1iv(this.addr,t)}function ZS(s,t){s.uniform2iv(this.addr,t)}function $S(s,t){s.uniform3iv(this.addr,t)}function JS(s,t){s.uniform4iv(this.addr,t)}function KS(s,t){s.uniform1uiv(this.addr,t)}function QS(s,t){s.uniform2uiv(this.addr,t)}function jS(s,t){s.uniform3uiv(this.addr,t)}function tb(s,t){s.uniform4uiv(this.addr,t)}function eb(s,t,e){const n=this.cache,i=t.length,r=bc(e,i);Ge(n,r)||(s.uniform1iv(this.addr,r),He(n,r));let a;this.type===s.SAMPLER_2D_SHADOW?a=Uh:a=Im;for(let o=0;o!==i;++o)e.setTexture2D(t[o]||a,r[o])}function nb(s,t,e){const n=this.cache,i=t.length,r=bc(e,i);Ge(n,r)||(s.uniform1iv(this.addr,r),He(n,r));for(let a=0;a!==i;++a)e.setTexture3D(t[a]||Lm,r[a])}function ib(s,t,e){const n=this.cache,i=t.length,r=bc(e,i);Ge(n,r)||(s.uniform1iv(this.addr,r),He(n,r));for(let a=0;a!==i;++a)e.setTextureCube(t[a]||Dm,r[a])}function sb(s,t,e){const n=this.cache,i=t.length,r=bc(e,i);Ge(n,r)||(s.uniform1iv(this.addr,r),He(n,r));for(let a=0;a!==i;++a)e.setTexture2DArray(t[a]||Pm,r[a])}function rb(s){switch(s){case 5126:return kS;case 35664:return VS;case 35665:return GS;case 35666:return HS;case 35674:return WS;case 35675:return XS;case 35676:return qS;case 5124:case 35670:return YS;case 35667:case 35671:return ZS;case 35668:case 35672:return $S;case 35669:case 35673:return JS;case 5125:return KS;case 36294:return QS;case 36295:return jS;case 36296:return tb;case 35678:case 36198:case 36298:case 36306:case 35682:return eb;case 35679:case 36299:case 36307:return nb;case 35680:case 36300:case 36308:case 36293:return ib;case 36289:case 36303:case 36311:case 36292:return sb}}class ab{constructor(t,e,n){this.id=t,this.addr=n,this.cache=[],this.type=e.type,this.setValue=zS(e.type)}}class ob{constructor(t,e,n){this.id=t,this.addr=n,this.cache=[],this.type=e.type,this.size=e.size,this.setValue=rb(e.type)}}class lb{constructor(t){this.id=t,this.seq=[],this.map={}}setValue(t,e,n){const i=this.seq;for(let r=0,a=i.length;r!==a;++r){const o=i[r];o.setValue(t,e[o.id],n)}}}const gh=/(\w+)(\])?(\[|\.)?/g;function wf(s,t){s.seq.push(t),s.map[t.id]=t}function cb(s,t,e){const n=s.name,i=n.length;for(gh.lastIndex=0;;){const r=gh.exec(n),a=gh.lastIndex;let o=r[1];const l=r[2]==="]",c=r[3];if(l&&(o=o|0),c===void 0||c==="["&&a+2===i){wf(e,c===void 0?new ab(o,s,t):new ob(o,s,t));break}else{let f=e.map[o];f===void 0&&(f=new lb(o),wf(e,f)),e=f}}}class Wo{constructor(t,e){this.seq=[],this.map={};const n=t.getProgramParameter(e,t.ACTIVE_UNIFORMS);for(let a=0;a<n;++a){const o=t.getActiveUniform(e,a),l=t.getUniformLocation(e,o.name);cb(o,l,this)}const i=[],r=[];for(const a of this.seq)a.type===t.SAMPLER_2D_SHADOW||a.type===t.SAMPLER_CUBE_SHADOW||a.type===t.SAMPLER_2D_ARRAY_SHADOW?i.push(a):r.push(a);i.length>0&&(this.seq=i.concat(r))}setValue(t,e,n,i){const r=this.map[e];r!==void 0&&r.setValue(t,n,i)}setOptional(t,e,n){const i=e[n];i!==void 0&&this.setValue(t,n,i)}static upload(t,e,n,i){for(let r=0,a=e.length;r!==a;++r){const o=e[r],l=n[o.id];l.needsUpdate!==!1&&o.setValue(t,l.value,i)}}static seqWithValue(t,e){const n=[];for(let i=0,r=t.length;i!==r;++i){const a=t[i];a.id in e&&n.push(a)}return n}}function Af(s,t,e){const n=s.createShader(t);return s.shaderSource(n,e),s.compileShader(n),n}const hb=37297;let ub=0;function db(s,t){const e=s.split(`
`),n=[],i=Math.max(t-6,0),r=Math.min(t+6,e.length);for(let a=i;a<r;a++){const o=a+1;n.push(`${o===t?">":" "} ${o}: ${e[a]}`)}return n.join(`
`)}const Tf=new Jt;function fb(s){ae._getMatrix(Tf,ae.workingColorSpace,s);const t=`mat3( ${Tf.elements.map(e=>e.toFixed(4))} )`;switch(ae.getTransfer(s)){case Ma:return[t,"LinearTransferOETF"];case me:return[t,"sRGBTransferOETF"];default:return pt("WebGLProgram: Unsupported color space: ",s),[t,"LinearTransferOETF"]}}function Ef(s,t,e){const n=s.getShaderParameter(t,s.COMPILE_STATUS),r=(s.getShaderInfoLog(t)||"").trim();if(n&&r==="")return"";const a=/ERROR: 0:(\d+)/.exec(r);if(a){const o=parseInt(a[1]);return e.toUpperCase()+`

`+r+`

`+db(s.getShaderSource(t),o)}else return r}function pb(s,t){const e=fb(t);return[`vec4 ${s}( vec4 value ) {`,`	return ${e[1]}( vec4( value.rgb * ${e[0]}, value.a ) );`,"}"].join(`
`)}const mb={[Wh]:"Linear",[Xh]:"Reinhard",[qh]:"Cineon",[zl]:"ACESFilmic",[Zh]:"AgX",[$h]:"Neutral",[Yh]:"Custom"};function gb(s,t){const e=mb[t];return e===void 0?(pt("WebGLProgram: Unsupported toneMapping:",t),"vec3 "+s+"( vec3 color ) { return LinearToneMapping( color ); }"):"vec3 "+s+"( vec3 color ) { return "+e+"ToneMapping( color ); }"}const Uo=new I;function _b(){ae.getLuminanceCoefficients(Uo);const s=Uo.x.toFixed(4),t=Uo.y.toFixed(4),e=Uo.z.toFixed(4);return["float luminance( const in vec3 rgb ) {",`	const vec3 weights = vec3( ${s}, ${t}, ${e} );`,"	return dot( weights, rgb );","}"].join(`
`)}function xb(s){return[s.extensionClipCullDistance?"#extension GL_ANGLE_clip_cull_distance : require":"",s.extensionMultiDraw?"#extension GL_ANGLE_multi_draw : require":""].filter(Kr).join(`
`)}function yb(s){const t=[];for(const e in s){const n=s[e];n!==!1&&t.push("#define "+e+" "+n)}return t.join(`
`)}function vb(s,t){const e={},n=s.getProgramParameter(t,s.ACTIVE_ATTRIBUTES);for(let i=0;i<n;i++){const r=s.getActiveAttrib(t,i),a=r.name;let o=1;r.type===s.FLOAT_MAT2&&(o=2),r.type===s.FLOAT_MAT3&&(o=3),r.type===s.FLOAT_MAT4&&(o=4),e[a]={type:r.type,location:s.getAttribLocation(t,a),locationSize:o}}return e}function Kr(s){return s!==""}function Cf(s,t){const e=t.numSpotLightShadows+t.numSpotLightMaps-t.numSpotLightShadowsWithMaps;return s.replace(/NUM_SUN_LIGHTS/g,t.numSunLights).replace(/NUM_DIR_LIGHTS/g,t.numDirLights).replace(/NUM_SPOT_LIGHTS/g,t.numSpotLights).replace(/NUM_SPOT_LIGHT_MAPS/g,t.numSpotLightMaps).replace(/NUM_SPOT_LIGHT_COORDS/g,e).replace(/NUM_RECT_AREA_LIGHTS/g,t.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,t.numPointLights).replace(/NUM_HEMI_LIGHTS/g,t.numHemiLights).replace(/NUM_SUN_LIGHT_SHADOWS/g,t.numSunLightShadows).replace(/NUM_DIR_LIGHT_SHADOWS/g,t.numDirLightShadows).replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g,t.numSpotLightShadowsWithMaps).replace(/NUM_SPOT_LIGHT_SHADOWS/g,t.numSpotLightShadows).replace(/NUM_POINT_LIGHT_SHADOWS/g,t.numPointLightShadows)}function Rf(s,t){return s.replace(/NUM_CLIPPING_PLANES/g,t.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,t.numClippingPlanes-t.numClipIntersection)}const Mb=/^[ \t]*#include +<([\w\d./]+)>/gm;function Fh(s){return s.replace(Mb,bb)}const Sb=new Map;function bb(s,t){let e=ee[t];if(e===void 0){const n=Sb.get(t);if(n!==void 0)e=ee[n],pt('WebGLRenderer: Shader chunk "%s" has been deprecated. Use "%s" instead.',t,n);else throw new Error("THREE.WebGLProgram: Can not resolve #include <"+t+">")}return Fh(e)}const wb=/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;function If(s){return s.replace(wb,Ab)}function Ab(s,t,e,n){let i="";for(let r=parseInt(t);r<parseInt(e);r++)i+=n.replace(/\[\s*i\s*\]/g,"[ "+r+" ]").replace(/UNROLLED_LOOP_INDEX/g,r);return i}function Pf(s){let t=`precision ${s.precision} float;
	precision ${s.precision} int;
	precision ${s.precision} sampler2D;
	precision ${s.precision} samplerCube;
	precision ${s.precision} sampler3D;
	precision ${s.precision} sampler2DArray;
	precision ${s.precision} sampler2DShadow;
	precision ${s.precision} samplerCubeShadow;
	precision ${s.precision} sampler2DArrayShadow;
	precision ${s.precision} isampler2D;
	precision ${s.precision} isampler3D;
	precision ${s.precision} isamplerCube;
	precision ${s.precision} isampler2DArray;
	precision ${s.precision} usampler2D;
	precision ${s.precision} usampler3D;
	precision ${s.precision} usamplerCube;
	precision ${s.precision} usampler2DArray;
	`;return s.precision==="highp"?t+=`
#define HIGH_PRECISION`:s.precision==="mediump"?t+=`
#define MEDIUM_PRECISION`:s.precision==="lowp"&&(t+=`
#define LOW_PRECISION`),t}const Tb={[ea]:"SHADOWMAP_TYPE_PCF",[sr]:"SHADOWMAP_TYPE_VSM"};function Eb(s){return Tb[s.shadowMapType]||"SHADOWMAP_TYPE_BASIC"}const Cb={[li]:"ENVMAP_TYPE_CUBE",[$i]:"ENVMAP_TYPE_CUBE",[br]:"ENVMAP_TYPE_CUBE_UV"};function Rb(s){return s.envMap===!1?"ENVMAP_TYPE_CUBE":Cb[s.envMapMode]||"ENVMAP_TYPE_CUBE"}const Ib={[$i]:"ENVMAP_MODE_REFRACTION"};function Pb(s){return s.envMap===!1?"ENVMAP_MODE_REFLECTION":Ib[s.envMapMode]||"ENVMAP_MODE_REFLECTION"}const Lb={[Da]:"ENVMAP_BLENDING_MULTIPLY",[cp]:"ENVMAP_BLENDING_MIX",[hp]:"ENVMAP_BLENDING_ADD"};function Db(s){return s.envMap===!1?"ENVMAP_BLENDING_NONE":Lb[s.combine]||"ENVMAP_BLENDING_NONE"}function Nb(s){const t=s.envMapCubeUVHeight;if(t===null)return null;const e=Math.log2(t)-2,n=1/t;return{texelWidth:1/(3*Math.max(Math.pow(2,e),112)),texelHeight:n,maxMip:e}}function Ub(s,t,e,n){const i=s.getContext(),r=e.defines;let a=e.vertexShader,o=e.fragmentShader;const l=Eb(e),c=Rb(e),h=Pb(e),f=Db(e),u=Nb(e),d=xb(e),p=yb(r),_=i.createProgram();let g,m,x=e.glslVersion?"#version "+e.glslVersion+`
`:"";e.isRawShaderMaterial?(g=["#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,p].filter(Kr).join(`
`),g.length>0&&(g+=`
`),m=["#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,p].filter(Kr).join(`
`),m.length>0&&(m+=`
`)):(g=[Pf(e),"#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,p,e.extensionClipCullDistance?"#define USE_CLIP_DISTANCE":"",e.batching?"#define USE_BATCHING":"",e.batchingColor?"#define USE_BATCHING_COLOR":"",e.instancing?"#define USE_INSTANCING":"",e.instancingColor?"#define USE_INSTANCING_COLOR":"",e.instancingMorph?"#define USE_INSTANCING_MORPH":"",e.useFog&&e.fog?"#define USE_FOG":"",e.useFog&&e.fogExp2?"#define FOG_EXP2":"",e.map?"#define USE_MAP":"",e.envMap?"#define USE_ENVMAP":"",e.envMap?"#define "+h:"",e.lightMap?"#define USE_LIGHTMAP":"",e.aoMap?"#define USE_AOMAP":"",e.bumpMap?"#define USE_BUMPMAP":"",e.normalMap?"#define USE_NORMALMAP":"",e.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",e.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",e.displacementMap?"#define USE_DISPLACEMENTMAP":"",e.emissiveMap?"#define USE_EMISSIVEMAP":"",e.anisotropy?"#define USE_ANISOTROPY":"",e.anisotropyMap?"#define USE_ANISOTROPYMAP":"",e.clearcoatMap?"#define USE_CLEARCOATMAP":"",e.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",e.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",e.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",e.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",e.specularMap?"#define USE_SPECULARMAP":"",e.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",e.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",e.roughnessMap?"#define USE_ROUGHNESSMAP":"",e.metalnessMap?"#define USE_METALNESSMAP":"",e.alphaMap?"#define USE_ALPHAMAP":"",e.alphaHash?"#define USE_ALPHAHASH":"",e.transmission?"#define USE_TRANSMISSION":"",e.transmissionMap?"#define USE_TRANSMISSIONMAP":"",e.thicknessMap?"#define USE_THICKNESSMAP":"",e.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",e.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",e.mapUv?"#define MAP_UV "+e.mapUv:"",e.alphaMapUv?"#define ALPHAMAP_UV "+e.alphaMapUv:"",e.lightMapUv?"#define LIGHTMAP_UV "+e.lightMapUv:"",e.aoMapUv?"#define AOMAP_UV "+e.aoMapUv:"",e.emissiveMapUv?"#define EMISSIVEMAP_UV "+e.emissiveMapUv:"",e.bumpMapUv?"#define BUMPMAP_UV "+e.bumpMapUv:"",e.normalMapUv?"#define NORMALMAP_UV "+e.normalMapUv:"",e.displacementMapUv?"#define DISPLACEMENTMAP_UV "+e.displacementMapUv:"",e.metalnessMapUv?"#define METALNESSMAP_UV "+e.metalnessMapUv:"",e.roughnessMapUv?"#define ROUGHNESSMAP_UV "+e.roughnessMapUv:"",e.anisotropyMapUv?"#define ANISOTROPYMAP_UV "+e.anisotropyMapUv:"",e.clearcoatMapUv?"#define CLEARCOATMAP_UV "+e.clearcoatMapUv:"",e.clearcoatNormalMapUv?"#define CLEARCOAT_NORMALMAP_UV "+e.clearcoatNormalMapUv:"",e.clearcoatRoughnessMapUv?"#define CLEARCOAT_ROUGHNESSMAP_UV "+e.clearcoatRoughnessMapUv:"",e.iridescenceMapUv?"#define IRIDESCENCEMAP_UV "+e.iridescenceMapUv:"",e.iridescenceThicknessMapUv?"#define IRIDESCENCE_THICKNESSMAP_UV "+e.iridescenceThicknessMapUv:"",e.sheenColorMapUv?"#define SHEEN_COLORMAP_UV "+e.sheenColorMapUv:"",e.sheenRoughnessMapUv?"#define SHEEN_ROUGHNESSMAP_UV "+e.sheenRoughnessMapUv:"",e.specularMapUv?"#define SPECULARMAP_UV "+e.specularMapUv:"",e.specularColorMapUv?"#define SPECULAR_COLORMAP_UV "+e.specularColorMapUv:"",e.specularIntensityMapUv?"#define SPECULAR_INTENSITYMAP_UV "+e.specularIntensityMapUv:"",e.transmissionMapUv?"#define TRANSMISSIONMAP_UV "+e.transmissionMapUv:"",e.thicknessMapUv?"#define THICKNESSMAP_UV "+e.thicknessMapUv:"",e.vertexTangents&&e.flatShading===!1?"#define USE_TANGENT":"",e.vertexNormals?"#define HAS_NORMAL":"",e.vertexColors?"#define USE_COLOR":"",e.vertexAlphas?"#define USE_COLOR_ALPHA":"",e.vertexUv1s?"#define USE_UV1":"",e.vertexUv2s?"#define USE_UV2":"",e.vertexUv3s?"#define USE_UV3":"",e.pointsUvs?"#define USE_POINTS_UV":"",e.flatShading?"#define FLAT_SHADED":"",e.skinning?"#define USE_SKINNING":"",e.morphTargets?"#define USE_MORPHTARGETS":"",e.morphNormals&&e.flatShading===!1?"#define USE_MORPHNORMALS":"",e.morphColors?"#define USE_MORPHCOLORS":"",e.morphTargetsCount>0?"#define MORPHTARGETS_TEXTURE_STRIDE "+e.morphTextureStride:"",e.morphTargetsCount>0?"#define MORPHTARGETS_COUNT "+e.morphTargetsCount:"",e.doubleSided?"#define DOUBLE_SIDED":"",e.flipSided?"#define FLIP_SIDED":"",e.shadowMapEnabled?"#define USE_SHADOWMAP":"",e.shadowMapEnabled?"#define "+l:"",e.sizeAttenuation?"#define USE_SIZEATTENUATION":"",e.numLightProbes>0?"#define USE_LIGHT_PROBES":"",e.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",e.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 modelMatrix;","uniform mat4 modelViewMatrix;","uniform mat4 projectionMatrix;","uniform mat4 viewMatrix;","uniform mat3 normalMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;","#ifdef USE_INSTANCING","	attribute mat4 instanceMatrix;","#endif","#ifdef USE_INSTANCING_COLOR","	attribute vec3 instanceColor;","#endif","#ifdef USE_INSTANCING_MORPH","	uniform sampler2D morphTexture;","#endif","attribute vec3 position;","attribute vec3 normal;","attribute vec2 uv;","#ifdef USE_UV1","	attribute vec2 uv1;","#endif","#ifdef USE_UV2","	attribute vec2 uv2;","#endif","#ifdef USE_UV3","	attribute vec2 uv3;","#endif","#ifdef USE_TANGENT","	attribute vec4 tangent;","#endif","#if defined( USE_COLOR_ALPHA )","	attribute vec4 color;","#elif defined( USE_COLOR )","	attribute vec3 color;","#endif","#ifdef USE_SKINNING","	attribute vec4 skinIndex;","	attribute vec4 skinWeight;","#endif",`
`].filter(Kr).join(`
`),m=[Pf(e),"#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,p,e.useFog&&e.fog?"#define USE_FOG":"",e.useFog&&e.fogExp2?"#define FOG_EXP2":"",e.alphaToCoverage?"#define ALPHA_TO_COVERAGE":"",e.map?"#define USE_MAP":"",e.matcap?"#define USE_MATCAP":"",e.envMap?"#define USE_ENVMAP":"",e.envMap?"#define "+c:"",e.envMap?"#define "+h:"",e.envMap?"#define "+f:"",u?"#define CUBEUV_TEXEL_WIDTH "+u.texelWidth:"",u?"#define CUBEUV_TEXEL_HEIGHT "+u.texelHeight:"",u?"#define CUBEUV_MAX_MIP "+u.maxMip+".0":"",e.lightMap?"#define USE_LIGHTMAP":"",e.aoMap?"#define USE_AOMAP":"",e.bumpMap?"#define USE_BUMPMAP":"",e.normalMap?"#define USE_NORMALMAP":"",e.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",e.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",e.packedNormalMap?"#define USE_PACKED_NORMALMAP":"",e.emissiveMap?"#define USE_EMISSIVEMAP":"",e.anisotropy?"#define USE_ANISOTROPY":"",e.anisotropyMap?"#define USE_ANISOTROPYMAP":"",e.clearcoat?"#define USE_CLEARCOAT":"",e.clearcoatMap?"#define USE_CLEARCOATMAP":"",e.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",e.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",e.dispersion?"#define USE_DISPERSION":"",e.retroreflection?"#define USE_RETROREFLECTION":"",e.iridescence?"#define USE_IRIDESCENCE":"",e.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",e.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",e.specularMap?"#define USE_SPECULARMAP":"",e.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",e.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",e.roughnessMap?"#define USE_ROUGHNESSMAP":"",e.metalnessMap?"#define USE_METALNESSMAP":"",e.alphaMap?"#define USE_ALPHAMAP":"",e.alphaTest?"#define USE_ALPHATEST":"",e.alphaHash?"#define USE_ALPHAHASH":"",e.sheen?"#define USE_SHEEN":"",e.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",e.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",e.transmission?"#define USE_TRANSMISSION":"",e.transmissionMap?"#define USE_TRANSMISSIONMAP":"",e.thicknessMap?"#define USE_THICKNESSMAP":"",e.vertexTangents&&e.flatShading===!1?"#define USE_TANGENT":"",e.vertexColors||e.instancingColor?"#define USE_COLOR":"",e.vertexAlphas||e.batchingColor?"#define USE_COLOR_ALPHA":"",e.vertexUv1s?"#define USE_UV1":"",e.vertexUv2s?"#define USE_UV2":"",e.vertexUv3s?"#define USE_UV3":"",e.pointsUvs?"#define USE_POINTS_UV":"",e.gradientMap?"#define USE_GRADIENTMAP":"",e.flatShading?"#define FLAT_SHADED":"",e.doubleSided?"#define DOUBLE_SIDED":"",e.flipSided?"#define FLIP_SIDED":"",e.shadowMapEnabled?"#define USE_SHADOWMAP":"",e.shadowMapEnabled?"#define "+l:"",e.premultipliedAlpha?"#define PREMULTIPLIED_ALPHA":"",e.numLightProbes>0?"#define USE_LIGHT_PROBES":"",e.numLightProbeGrids>0?"#define USE_LIGHT_PROBES_GRID":"",e.decodeVideoTexture?"#define DECODE_VIDEO_TEXTURE":"",e.decodeVideoTextureEmissive?"#define DECODE_VIDEO_TEXTURE_EMISSIVE":"",e.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",e.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 viewMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;",e.toneMapping!==Yn?"#define TONE_MAPPING":"",e.toneMapping!==Yn?ee.tonemapping_pars_fragment:"",e.toneMapping!==Yn?gb("toneMapping",e.toneMapping):"",e.dithering?"#define DITHERING":"",e.opaque?"#define OPAQUE":"",ee.colorspace_pars_fragment,pb("linearToOutputTexel",e.outputColorSpace),_b(),e.useDepthPacking?"#define DEPTH_PACKING "+e.depthPacking:"",`
`].filter(Kr).join(`
`)),a=Fh(a),a=Cf(a,e),a=Rf(a,e),o=Fh(o),o=Cf(o,e),o=Rf(o,e),a=If(a),o=If(o),e.isRawShaderMaterial!==!0&&(x=`#version 300 es
`,g=[d,"#define attribute in","#define varying out","#define texture2D texture"].join(`
`)+`
`+g,m=["#define varying in",e.glslVersion===Ah?"":"layout(location = 0) out highp vec4 pc_fragColor;",e.glslVersion===Ah?"":"#define gl_FragColor pc_fragColor","#define gl_FragDepthEXT gl_FragDepth","#define texture2D texture","#define textureCube texture","#define texture2DProj textureProj","#define texture2DLodEXT textureLod","#define texture2DProjLodEXT textureProjLod","#define textureCubeLodEXT textureLod","#define texture2DGradEXT textureGrad","#define texture2DProjGradEXT textureProjGrad","#define textureCubeGradEXT textureGrad"].join(`
`)+`
`+m);const M=x+g+a,y=x+m+o,w=Af(i,i.VERTEX_SHADER,M),b=Af(i,i.FRAGMENT_SHADER,y);i.attachShader(_,w),i.attachShader(_,b),e.index0AttributeName!==void 0?i.bindAttribLocation(_,0,e.index0AttributeName):e.hasPositionAttribute===!0&&i.bindAttribLocation(_,0,"position"),i.linkProgram(_);function E(P){if(s.debug.checkShaderErrors){const L=i.getProgramInfoLog(_)||"",N=i.getShaderInfoLog(w)||"",D=i.getShaderInfoLog(b)||"",O=L.trim(),V=N.trim(),z=D.trim();let G=!0,X=!0;if(i.getProgramParameter(_,i.LINK_STATUS)===!1)if(G=!1,typeof s.debug.onShaderError=="function")s.debug.onShaderError(i,_,w,b);else{const $=Ef(i,w,"vertex"),Z=Ef(i,b,"fragment");Nt("WebGLProgram: Shader Error "+i.getError()+" - VALIDATE_STATUS "+i.getProgramParameter(_,i.VALIDATE_STATUS)+`

Material Name: `+P.name+`
Material Type: `+P.type+`

Program Info Log: `+O+`
`+$+`
`+Z)}else O!==""?pt("WebGLProgram: Program Info Log:",O):(V===""||z==="")&&(X=!1);X&&(P.diagnostics={runnable:G,programLog:O,vertexShader:{log:V,prefix:g},fragmentShader:{log:z,prefix:m}})}i.deleteShader(w),i.deleteShader(b),v=new Wo(i,_),T=vb(i,_)}let v;this.getUniforms=function(){return v===void 0&&E(this),v};let T;this.getAttributes=function(){return T===void 0&&E(this),T};let C=e.rendererExtensionParallelShaderCompile===!1;return this.isReady=function(){return C===!1&&(C=i.getProgramParameter(_,hb)),C},this.destroy=function(){n.releaseStatesOfProgram(this),i.deleteProgram(_),this.program=void 0},this.type=e.shaderType,this.name=e.shaderName,this.id=ub++,this.cacheKey=t,this.usedTimes=1,this.program=_,this.vertexShader=w,this.fragmentShader=b,this}let Fb=0;class Ob{constructor(){this.shaderCache=new Map,this.materialCache=new Map}update(t,e,n){const i=this._getShaderCacheForMaterial(t);return i.has(e)===!1&&(i.add(e),e.usedTimes++),i.has(n)===!1&&(i.add(n),n.usedTimes++),this}remove(t){const e=this.materialCache.get(t);for(const n of e)n.usedTimes--,n.usedTimes===0&&this.shaderCache.delete(n.code);return this.materialCache.delete(t),this}getVertexShaderStage(t){return this._getShaderStage(t.vertexShader)}getFragmentShaderStage(t){return this._getShaderStage(t.fragmentShader)}dispose(){this.shaderCache.clear(),this.materialCache.clear()}_getShaderCacheForMaterial(t){const e=this.materialCache;let n=e.get(t);return n===void 0&&(n=new Set,e.set(t,n)),n}_getShaderStage(t){const e=this.shaderCache;let n=e.get(t);return n===void 0&&(n=new Bb(t),e.set(t,n)),n}}class Bb{constructor(t){this.id=Fb++,this.code=t,this.usedTimes=0}}function zb(s){return s===Ji||s===ga||s===_a}function kb(s,t,e,n,i,r){const a=new jl,o=new Ob,l=new Set,c=[],h=new Map,f=n.logarithmicDepthBuffer;let u=n.precision;const d={MeshDepthMaterial:"depth",MeshDistanceMaterial:"distance",MeshNormalMaterial:"normal",MeshBasicMaterial:"basic",MeshLambertMaterial:"lambert",MeshPhongMaterial:"phong",MeshToonMaterial:"toon",MeshStandardMaterial:"physical",MeshPhysicalMaterial:"physical",MeshMatcapMaterial:"matcap",LineBasicMaterial:"basic",LineDashedMaterial:"dashed",PointsMaterial:"points",ShadowMaterial:"shadow",SpriteMaterial:"sprite"};function p(v){return l.add(v),v===0?"uv":`uv${v}`}function _(v,T,C,P,L,N){const D=P.fog,O=L.geometry,V=v.isMeshStandardMaterial||v.isMeshLambertMaterial||v.isMeshPhongMaterial?P.environment:null,z=v.isMeshStandardMaterial||v.isMeshLambertMaterial&&!v.envMap||v.isMeshPhongMaterial&&!v.envMap,G=t.get(v.envMap||V,z),X=G&&G.mapping===br?G.image.height:null,$=d[v.type];v.precision!==null&&(u=n.getMaxPrecision(v.precision),u!==v.precision&&pt("WebGLProgram.getParameters:",v.precision,"not supported, using",u,"instead."));const Z=O.morphAttributes.position||O.morphAttributes.normal||O.morphAttributes.color,ct=Z!==void 0?Z.length:0;let bt=0;O.morphAttributes.position!==void 0&&(bt=1),O.morphAttributes.normal!==void 0&&(bt=2),O.morphAttributes.color!==void 0&&(bt=3);let $t,Wt,Qt,K;if($){const Me=Hn[$];$t=Me.vertexShader,Wt=Me.fragmentShader}else{$t=v.vertexShader,Wt=v.fragmentShader;const Me=o.getVertexShaderStage(v),fe=o.getFragmentShaderStage(v);o.update(v,Me,fe),Qt=Me.id,K=fe.id}const tt=s.getRenderTarget(),ft=s.state.buffers.depth.getReversed(),kt=L.isInstancedMesh===!0,Tt=L.isBatchedMesh===!0,Xt=!!v.map,ge=!!v.matcap,nt=!!G,rt=!!v.aoMap,at=!!v.lightMap,ot=!!v.bumpMap&&v.wireframe===!1,dt=!!v.normalMap,Vt=!!v.displacementMap,Bt=!!v.emissiveMap,qt=!!v.metalnessMap,Kt=!!v.roughnessMap,U=v.anisotropy>0,de=v.clearcoat>0,ie=v.dispersion>0,R=v.retroreflectivity>0,S=v.iridescence>0,k=v.sheen>0,q=v.transmission>0,J=U&&!!v.anisotropyMap,lt=de&&!!v.clearcoatMap,ht=de&&!!v.clearcoatNormalMap,Q=de&&!!v.clearcoatRoughnessMap,et=S&&!!v.iridescenceMap,mt=S&&!!v.iridescenceThicknessMap,Ut=k&&!!v.sheenColorMap,vt=k&&!!v.sheenRoughnessMap,gt=!!v.specularMap,Ft=!!v.specularColorMap,Gt=!!v.specularIntensityMap,jt=q&&!!v.transmissionMap,B=q&&!!v.thicknessMap,_t=!!v.gradientMap,j=!!v.alphaMap,xt=v.alphaTest>0,At=!!v.alphaHash,st=!!v.extensions;let Ot=Yn;v.toneMapped&&(tt===null||tt.isXRRenderTarget===!0)&&(Ot=s.toneMapping);const Lt={shaderID:$,shaderType:v.type,shaderName:v.name,vertexShader:$t,fragmentShader:Wt,defines:v.defines,customVertexShaderID:Qt,customFragmentShaderID:K,isRawShaderMaterial:v.isRawShaderMaterial===!0,glslVersion:v.glslVersion,precision:u,batching:Tt,batchingColor:Tt&&L._colorsTexture!==null,instancing:kt,instancingColor:kt&&L.instanceColor!==null,instancingMorph:kt&&L.morphTexture!==null,outputColorSpace:tt===null?s.outputColorSpace:tt.isXRRenderTarget===!0?tt.texture.colorSpace:ae.workingColorSpace,alphaToCoverage:!!v.alphaToCoverage,map:Xt,matcap:ge,envMap:nt,envMapMode:nt&&G.mapping,envMapCubeUVHeight:X,aoMap:rt,lightMap:at,bumpMap:ot,normalMap:dt,displacementMap:Vt,emissiveMap:Bt,normalMapObjectSpace:dt&&v.normalMapType===gp,normalMapTangentSpace:dt&&v.normalMapType===Pi,packedNormalMap:dt&&v.normalMapType===Pi&&zb(v.normalMap.format),metalnessMap:qt,roughnessMap:Kt,anisotropy:U,anisotropyMap:J,clearcoat:de,clearcoatMap:lt,clearcoatNormalMap:ht,clearcoatRoughnessMap:Q,dispersion:ie,retroreflection:R,iridescence:S,iridescenceMap:et,iridescenceThicknessMap:mt,sheen:k,sheenColorMap:Ut,sheenRoughnessMap:vt,specularMap:gt,specularColorMap:Ft,specularIntensityMap:Gt,transmission:q,transmissionMap:jt,thicknessMap:B,gradientMap:_t,opaque:v.transparent===!1&&v.blending===cr&&v.alphaToCoverage===!1,alphaMap:j,alphaTest:xt,alphaHash:At,combine:v.combine,mapUv:Xt&&p(v.map.channel),aoMapUv:rt&&p(v.aoMap.channel),lightMapUv:at&&p(v.lightMap.channel),bumpMapUv:ot&&p(v.bumpMap.channel),normalMapUv:dt&&p(v.normalMap.channel),displacementMapUv:Vt&&p(v.displacementMap.channel),emissiveMapUv:Bt&&p(v.emissiveMap.channel),metalnessMapUv:qt&&p(v.metalnessMap.channel),roughnessMapUv:Kt&&p(v.roughnessMap.channel),anisotropyMapUv:J&&p(v.anisotropyMap.channel),clearcoatMapUv:lt&&p(v.clearcoatMap.channel),clearcoatNormalMapUv:ht&&p(v.clearcoatNormalMap.channel),clearcoatRoughnessMapUv:Q&&p(v.clearcoatRoughnessMap.channel),iridescenceMapUv:et&&p(v.iridescenceMap.channel),iridescenceThicknessMapUv:mt&&p(v.iridescenceThicknessMap.channel),sheenColorMapUv:Ut&&p(v.sheenColorMap.channel),sheenRoughnessMapUv:vt&&p(v.sheenRoughnessMap.channel),specularMapUv:gt&&p(v.specularMap.channel),specularColorMapUv:Ft&&p(v.specularColorMap.channel),specularIntensityMapUv:Gt&&p(v.specularIntensityMap.channel),transmissionMapUv:jt&&p(v.transmissionMap.channel),thicknessMapUv:B&&p(v.thicknessMap.channel),alphaMapUv:j&&p(v.alphaMap.channel),vertexTangents:!!O.attributes.tangent&&(dt||U),vertexNormals:!!O.attributes.normal,vertexColors:v.vertexColors,vertexAlphas:v.vertexColors===!0&&!!O.attributes.color&&O.attributes.color.itemSize===4,pointsUvs:L.isPoints===!0&&!!O.attributes.uv&&(Xt||j),fog:!!D,useFog:v.fog===!0,fogExp2:!!D&&D.isFogExp2,flatShading:v.wireframe===!1&&(v.flatShading===!0||O.attributes.normal===void 0&&dt===!1&&(v.isMeshLambertMaterial||v.isMeshPhongMaterial||v.isMeshStandardMaterial||v.isMeshPhysicalMaterial)),sizeAttenuation:v.sizeAttenuation===!0,logarithmicDepthBuffer:f,reversedDepthBuffer:ft,skinning:L.isSkinnedMesh===!0,hasPositionAttribute:O.attributes.position!==void 0,morphTargets:O.morphAttributes.position!==void 0,morphNormals:O.morphAttributes.normal!==void 0,morphColors:O.morphAttributes.color!==void 0,morphTargetsCount:ct,morphTextureStride:bt,numSunLights:T.sun.length,numDirLights:T.directional.length,numPointLights:T.point.length,numSpotLights:T.spot.length,numSpotLightMaps:T.spotLightMap.length,numRectAreaLights:T.rectArea.length,numHemiLights:T.hemi.length,numSunLightShadows:T.sunShadowMap.length,numDirLightShadows:T.directionalShadowMap.length,numPointLightShadows:T.pointShadowMap.length,numSpotLightShadows:T.spotShadowMap.length,numSpotLightShadowsWithMaps:T.numSpotLightShadowsWithMaps,numLightProbes:T.numLightProbes,numLightProbeGrids:N.length,numClippingPlanes:r.numPlanes,numClipIntersection:r.numIntersection,dithering:v.dithering,shadowMapEnabled:s.shadowMap.enabled&&C.length>0,shadowMapType:s.shadowMap.type,toneMapping:Ot,decodeVideoTexture:Xt&&v.map.isVideoTexture===!0&&ae.getTransfer(v.map.colorSpace)===me,decodeVideoTextureEmissive:Bt&&v.emissiveMap.isVideoTexture===!0&&ae.getTransfer(v.emissiveMap.colorSpace)===me,premultipliedAlpha:v.premultipliedAlpha,doubleSided:v.side===Xn,flipSided:v.side===nn,useDepthPacking:v.depthPacking>=0,depthPacking:v.depthPacking||0,index0AttributeName:v.index0AttributeName,extensionClipCullDistance:st&&v.extensions.clipCullDistance===!0&&e.has("WEBGL_clip_cull_distance"),extensionMultiDraw:(st&&v.extensions.multiDraw===!0||Tt)&&e.has("WEBGL_multi_draw"),rendererExtensionParallelShaderCompile:e.has("KHR_parallel_shader_compile"),customProgramCacheKey:v.customProgramCacheKey()};return Lt.vertexUv1s=l.has(1),Lt.vertexUv2s=l.has(2),Lt.vertexUv3s=l.has(3),l.clear(),Lt}function g(v){const T=[];if(v.shaderID?T.push(v.shaderID):(T.push(v.customVertexShaderID),T.push(v.customFragmentShaderID)),v.defines!==void 0)for(const C in v.defines)T.push(C),T.push(v.defines[C]);return v.isRawShaderMaterial===!1&&(m(T,v),x(T,v),T.push(s.outputColorSpace)),T.push(v.customProgramCacheKey),T.join()}function m(v,T){v.push(T.precision),v.push(T.outputColorSpace),v.push(T.envMapMode),v.push(T.envMapCubeUVHeight),v.push(T.mapUv),v.push(T.alphaMapUv),v.push(T.lightMapUv),v.push(T.aoMapUv),v.push(T.bumpMapUv),v.push(T.normalMapUv),v.push(T.displacementMapUv),v.push(T.emissiveMapUv),v.push(T.metalnessMapUv),v.push(T.roughnessMapUv),v.push(T.anisotropyMapUv),v.push(T.clearcoatMapUv),v.push(T.clearcoatNormalMapUv),v.push(T.clearcoatRoughnessMapUv),v.push(T.iridescenceMapUv),v.push(T.iridescenceThicknessMapUv),v.push(T.sheenColorMapUv),v.push(T.sheenRoughnessMapUv),v.push(T.specularMapUv),v.push(T.specularColorMapUv),v.push(T.specularIntensityMapUv),v.push(T.transmissionMapUv),v.push(T.thicknessMapUv),v.push(T.combine),v.push(T.fogExp2),v.push(T.sizeAttenuation),v.push(T.morphTargetsCount),v.push(T.morphAttributeCount),v.push(T.numSunLights),v.push(T.numDirLights),v.push(T.numPointLights),v.push(T.numSpotLights),v.push(T.numSpotLightMaps),v.push(T.numHemiLights),v.push(T.numRectAreaLights),v.push(T.numSunLightShadows),v.push(T.numDirLightShadows),v.push(T.numPointLightShadows),v.push(T.numSpotLightShadows),v.push(T.numSpotLightShadowsWithMaps),v.push(T.numLightProbes),v.push(T.shadowMapType),v.push(T.toneMapping),v.push(T.numClippingPlanes),v.push(T.numClipIntersection),v.push(T.depthPacking)}function x(v,T){a.disableAll(),T.instancing&&a.enable(0),T.instancingColor&&a.enable(1),T.instancingMorph&&a.enable(2),T.matcap&&a.enable(3),T.envMap&&a.enable(4),T.normalMapObjectSpace&&a.enable(5),T.normalMapTangentSpace&&a.enable(6),T.clearcoat&&a.enable(7),T.iridescence&&a.enable(8),T.alphaTest&&a.enable(9),T.vertexColors&&a.enable(10),T.vertexAlphas&&a.enable(11),T.vertexUv1s&&a.enable(12),T.vertexUv2s&&a.enable(13),T.vertexUv3s&&a.enable(14),T.vertexTangents&&a.enable(15),T.anisotropy&&a.enable(16),T.alphaHash&&a.enable(17),T.batching&&a.enable(18),T.dispersion&&a.enable(19),T.retroreflection&&a.enable(24),T.batchingColor&&a.enable(20),T.gradientMap&&a.enable(21),T.packedNormalMap&&a.enable(22),T.vertexNormals&&a.enable(23),v.push(a.mask),a.disableAll(),T.fog&&a.enable(0),T.useFog&&a.enable(1),T.flatShading&&a.enable(2),T.logarithmicDepthBuffer&&a.enable(3),T.reversedDepthBuffer&&a.enable(4),T.skinning&&a.enable(5),T.morphTargets&&a.enable(6),T.morphNormals&&a.enable(7),T.morphColors&&a.enable(8),T.premultipliedAlpha&&a.enable(9),T.shadowMapEnabled&&a.enable(10),T.doubleSided&&a.enable(11),T.flipSided&&a.enable(12),T.useDepthPacking&&a.enable(13),T.dithering&&a.enable(14),T.transmission&&a.enable(15),T.sheen&&a.enable(16),T.opaque&&a.enable(17),T.pointsUvs&&a.enable(18),T.decodeVideoTexture&&a.enable(19),T.decodeVideoTextureEmissive&&a.enable(20),T.alphaToCoverage&&a.enable(21),T.numLightProbeGrids>0&&a.enable(22),T.hasPositionAttribute&&a.enable(23),v.push(a.mask)}function M(v){const T=d[v.type];let C;if(T){const P=Hn[T];C=Kp.clone(P.uniforms)}else C=v.uniforms;return C}function y(v,T){let C=h.get(T);return C!==void 0?++C.usedTimes:(C=new Ub(s,T,v,i),c.push(C),h.set(T,C)),C}function w(v){if(--v.usedTimes===0){const T=c.indexOf(v);c[T]=c[c.length-1],c.pop(),h.delete(v.cacheKey),v.destroy()}}function b(v){o.remove(v)}function E(){o.dispose()}return{getParameters:_,getProgramCacheKey:g,getUniforms:M,acquireProgram:y,releaseProgram:w,releaseShaderCache:b,programs:c,dispose:E}}function Vb(){let s=new WeakMap;function t(a){return s.has(a)}function e(a){let o=s.get(a);return o===void 0&&(o={},s.set(a,o)),o}function n(a){s.delete(a)}function i(a,o,l){s.get(a)[o]=l}function r(){s=new WeakMap}return{has:t,get:e,remove:n,update:i,dispose:r}}function Gb(s,t){return s.groupOrder!==t.groupOrder?s.groupOrder-t.groupOrder:s.renderOrder!==t.renderOrder?s.renderOrder-t.renderOrder:s.material.id!==t.material.id?s.material.id-t.material.id:s.materialVariant!==t.materialVariant?s.materialVariant-t.materialVariant:s.z!==t.z?s.z-t.z:s.id-t.id}function Lf(s,t){return s.groupOrder!==t.groupOrder?s.groupOrder-t.groupOrder:s.renderOrder!==t.renderOrder?s.renderOrder-t.renderOrder:s.z!==t.z?t.z-s.z:s.id-t.id}function Df(){const s=[];let t=0;const e=[],n=[],i=[];function r(){t=0,e.length=0,n.length=0,i.length=0}function a(u){let d=0;return u.isInstancedMesh&&(d+=2),u.isSkinnedMesh&&(d+=1),d}function o(u,d,p,_,g,m){let x=s[t];return x===void 0?(x={id:u.id,object:u,geometry:d,material:p,materialVariant:a(u),groupOrder:_,renderOrder:u.renderOrder,z:g,group:m},s[t]=x):(x.id=u.id,x.object=u,x.geometry=d,x.material=p,x.materialVariant=a(u),x.groupOrder=_,x.renderOrder=u.renderOrder,x.z=g,x.group=m),t++,x}function l(u,d,p,_,g,m,x){x.reversedDepth===!0&&(g=-g);const M=o(u,d,p,_,g,m);p.transmission>0?n.push(M):p.transparent===!0?i.push(M):e.push(M)}function c(u,d,p,_,g,m){const x=o(u,d,p,_,g,m);p.transmission>0?n.unshift(x):p.transparent===!0?i.unshift(x):e.unshift(x)}function h(u,d){e.length>1&&e.sort(u||Gb),n.length>1&&n.sort(d||Lf),i.length>1&&i.sort(d||Lf)}function f(){for(let u=t,d=s.length;u<d;u++){const p=s[u];if(p.id===null)break;p.id=null,p.object=null,p.geometry=null,p.material=null,p.group=null}}return{opaque:e,transmissive:n,transparent:i,init:r,push:l,unshift:c,finish:f,sort:h}}function Hb(){let s=new WeakMap;function t(n,i){const r=s.get(n);let a;return r===void 0?(a=new Df,s.set(n,[a])):i>=r.length?(a=new Df,r.push(a)):a=r[i],a}function e(){s=new WeakMap}return{get:t,dispose:e}}function Wb(){const s={};return{get:function(t){if(s[t.id]!==void 0)return s[t.id];let e;switch(t.type){case"SunLight":case"DirectionalLight":e={direction:new I,color:new ut};break;case"SpotLight":e={position:new I,direction:new I,color:new ut,distance:0,coneCos:0,penumbraCos:0,decay:0};break;case"PointLight":e={position:new I,color:new ut,distance:0,decay:0};break;case"HemisphereLight":e={direction:new I,skyColor:new ut,groundColor:new ut};break;case"RectAreaLight":e={color:new ut,position:new I,halfWidth:new I,halfHeight:new I};break}return s[t.id]=e,e}}}function Xb(){const s={};return{get:function(t){if(s[t.id]!==void 0)return s[t.id];let e;switch(t.type){case"SunLight":case"DirectionalLight":e={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new it};break;case"SpotLight":e={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new it};break;case"PointLight":e={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new it,shadowCameraNear:1,shadowCameraFar:1e3};break}return s[t.id]=e,e}}}let qb=0;function Yb(s,t){return(t.castShadow?2:0)-(s.castShadow?2:0)+(t.map?1:0)-(s.map?1:0)}function Zb(s){const t=new Wb,e=Xb(),n={version:0,hash:{sunLength:-1,directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,numSunShadows:-1,numDirectionalShadows:-1,numPointShadows:-1,numSpotShadows:-1,numSpotMaps:-1,numLightProbes:-1},ambient:[0,0,0],probe:[],sun:[],sunShadow:[],sunShadowMap:[],sunShadowMatrix:[],sunShadowCascade:[],directional:[],directionalShadow:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotLightMap:[],spotShadow:[],spotShadowMap:[],spotLightMatrix:[],rectArea:[],rectAreaLTC1:null,rectAreaLTC2:null,point:[],pointShadow:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};for(let c=0;c<9;c++)n.probe.push(new I);const i=new I,r=new Yt,a=new Yt;function o(c){let h=0,f=0,u=0;for(let L=0;L<9;L++)n.probe[L].set(0,0,0);let d=0,p=0,_=0,g=0,m=0,x=0,M=0,y=0,w=0,b=0,E=0,v=0,T=0,C=0;c.sort(Yb);for(let L=0,N=c.length;L<N;L++){const D=c[L],O=D.color,V=D.intensity,z=D.distance;let G=null;if(D.shadow&&D.shadow.map&&(D.shadow.map.texture.format===Ji?G=D.shadow.map.texture:G=D.shadow.map.depthTexture||D.shadow.map.texture),D.isAmbientLight)h+=O.r*V,f+=O.g*V,u+=O.b*V;else if(D.isLightProbe){for(let X=0;X<9;X++)n.probe[X].addScaledVector(D.sh.coefficients[X],V);C++}else if(D.isSunLight){const X=t.get(D);if(X.color.copy(D.color).multiplyScalar(D.intensity),D.castShadow){const $=D.shadow,Z=e.get(D);Z.shadowIntensity=$.intensity,Z.shadowBias=$.bias,Z.shadowNormalBias=$.normalBias,Z.shadowRadius=$.radius,Z.shadowMapSize.copy($.mapSize).multiply($.getFrameExtents()),n.sunShadow[p]=Z,n.sunShadowMap[p]=G;const ct=$.getViewportCount();for(let bt=0;bt<ct;bt++)n.sunShadowMatrix[_+bt]=$.getMatrix(bt),n.sunShadowCascade[_+bt]=$._cascadeData[bt];_+=ct,p++}n.sun[d]=X,d++}else if(D.isDirectionalLight){const X=t.get(D);if(X.color.copy(D.color).multiplyScalar(D.intensity),D.castShadow){const $=D.shadow,Z=e.get(D);Z.shadowIntensity=$.intensity,Z.shadowBias=$.bias,Z.shadowNormalBias=$.normalBias,Z.shadowRadius=$.radius,Z.shadowMapSize=$.mapSize,n.directionalShadow[g]=Z,n.directionalShadowMap[g]=G,n.directionalShadowMatrix[g]=D.shadow.matrix,w++}n.directional[g]=X,g++}else if(D.isSpotLight){const X=t.get(D);X.position.setFromMatrixPosition(D.matrixWorld),X.color.copy(O).multiplyScalar(V),X.distance=z,X.coneCos=Math.cos(D.angle),X.penumbraCos=Math.cos(D.angle*(1-D.penumbra)),X.decay=D.decay,n.spot[x]=X;const $=D.shadow;if(D.map&&(n.spotLightMap[v]=D.map,v++,$.updateMatrices(D),D.castShadow&&T++),n.spotLightMatrix[x]=$.matrix,D.castShadow){const Z=e.get(D);Z.shadowIntensity=$.intensity,Z.shadowBias=$.bias,Z.shadowNormalBias=$.normalBias,Z.shadowRadius=$.radius,Z.shadowMapSize=$.mapSize,n.spotShadow[x]=Z,n.spotShadowMap[x]=G,E++}x++}else if(D.isRectAreaLight){const X=t.get(D);X.color.copy(O).multiplyScalar(V),X.halfWidth.set(D.width*.5,0,0),X.halfHeight.set(0,D.height*.5,0),n.rectArea[M]=X,M++}else if(D.isPointLight){const X=t.get(D);if(X.color.copy(D.color).multiplyScalar(D.intensity),X.distance=D.distance,X.decay=D.decay,D.castShadow){const $=D.shadow,Z=e.get(D);Z.shadowIntensity=$.intensity,Z.shadowBias=$.bias,Z.shadowNormalBias=$.normalBias,Z.shadowRadius=$.radius,Z.shadowMapSize=$.mapSize,Z.shadowCameraNear=$.camera.near,Z.shadowCameraFar=$.camera.far,n.pointShadow[m]=Z,n.pointShadowMap[m]=G,n.pointShadowMatrix[m]=D.shadow.matrix,b++}n.point[m]=X,m++}else if(D.isHemisphereLight){const X=t.get(D);X.skyColor.copy(D.color).multiplyScalar(V),X.groundColor.copy(D.groundColor).multiplyScalar(V),n.hemi[y]=X,y++}}M>0&&(s.has("OES_texture_float_linear")===!0?(n.rectAreaLTC1=yt.LTC_FLOAT_1,n.rectAreaLTC2=yt.LTC_FLOAT_2):(n.rectAreaLTC1=yt.LTC_HALF_1,n.rectAreaLTC2=yt.LTC_HALF_2)),n.ambient[0]=h,n.ambient[1]=f,n.ambient[2]=u;const P=n.hash;(P.sunLength!==d||P.directionalLength!==g||P.pointLength!==m||P.spotLength!==x||P.rectAreaLength!==M||P.hemiLength!==y||P.numSunShadows!==p||P.numDirectionalShadows!==w||P.numPointShadows!==b||P.numSpotShadows!==E||P.numSpotMaps!==v||P.numLightProbes!==C)&&(n.sun.length=d,n.directional.length=g,n.spot.length=x,n.rectArea.length=M,n.point.length=m,n.hemi.length=y,n.sunShadow.length=p,n.sunShadowMap.length=p,n.sunShadowMatrix.length=_,n.sunShadowCascade.length=_,n.directionalShadow.length=w,n.directionalShadowMap.length=w,n.directionalShadowMatrix.length=w,n.pointShadow.length=b,n.pointShadowMap.length=b,n.pointShadowMatrix.length=b,n.spotShadow.length=E,n.spotShadowMap.length=E,n.spotLightMatrix.length=E+v-T,n.spotLightMap.length=v,n.numSpotLightShadowsWithMaps=T,n.numLightProbes=C,P.sunLength=d,P.directionalLength=g,P.pointLength=m,P.spotLength=x,P.rectAreaLength=M,P.hemiLength=y,P.numSunShadows=p,P.numDirectionalShadows=w,P.numPointShadows=b,P.numSpotShadows=E,P.numSpotMaps=v,P.numLightProbes=C,n.version=qb++)}function l(c,h){let f=0,u=0,d=0,p=0,_=0,g=0;const m=h.matrixWorldInverse;for(let x=0,M=c.length;x<M;x++){const y=c[x];if(y.isSunLight){const w=n.sun[f];w.direction.setFromMatrixPosition(y.matrixWorld),w.direction.transformDirection(m),f++}else if(y.isDirectionalLight){const w=n.directional[u];w.direction.setFromMatrixPosition(y.matrixWorld),i.setFromMatrixPosition(y.target.matrixWorld),w.direction.sub(i),w.direction.transformDirection(m),u++}else if(y.isSpotLight){const w=n.spot[p];w.position.setFromMatrixPosition(y.matrixWorld),w.position.applyMatrix4(m),w.direction.setFromMatrixPosition(y.matrixWorld),i.setFromMatrixPosition(y.target.matrixWorld),w.direction.sub(i),w.direction.transformDirection(m),p++}else if(y.isRectAreaLight){const w=n.rectArea[_];w.position.setFromMatrixPosition(y.matrixWorld),w.position.applyMatrix4(m),a.identity(),r.copy(y.matrixWorld),r.premultiply(m),a.extractRotation(r),w.halfWidth.set(y.width*.5,0,0),w.halfHeight.set(0,y.height*.5,0),w.halfWidth.applyMatrix4(a),w.halfHeight.applyMatrix4(a),_++}else if(y.isPointLight){const w=n.point[d];w.position.setFromMatrixPosition(y.matrixWorld),w.position.applyMatrix4(m),d++}else if(y.isHemisphereLight){const w=n.hemi[g];w.direction.setFromMatrixPosition(y.matrixWorld),w.direction.transformDirection(m),g++}}}return{setup:o,setupView:l,state:n}}function Nf(s){const t=new Zb(s),e=[],n=[],i=[];function r(u){f.camera=u,e.length=0,n.length=0,i.length=0}function a(u){e.push(u)}function o(u){n.push(u)}function l(u){i.push(u)}function c(){t.setup(e)}function h(u){t.setupView(e,u)}const f={lightsArray:e,shadowsArray:n,lightProbeGridArray:i,camera:null,lights:t,transmissionRenderTarget:{},textureUnits:0};return{init:r,state:f,setupLights:c,setupLightsView:h,pushLight:a,pushShadow:o,pushLightProbeGrid:l}}function $b(s){let t=new WeakMap;function e(i,r=0){const a=t.get(i);let o;return a===void 0?(o=new Nf(s),t.set(i,[o])):r>=a.length?(o=new Nf(s),a.push(o)):o=a[r],o}function n(){t=new WeakMap}return{get:e,dispose:n}}const Jb=`void main() {
	gl_Position = vec4( position, 1.0 );
}`,Kb=`uniform sampler2D shadow_pass;
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
}`,Qb=[new I(1,0,0),new I(-1,0,0),new I(0,1,0),new I(0,-1,0),new I(0,0,1),new I(0,0,-1)],jb=[new I(0,-1,0),new I(0,-1,0),new I(0,0,1),new I(0,0,-1),new I(0,-1,0),new I(0,-1,0)],Uf=new Yt,Hr=new I,_h=new I;function t1(s,t,e){let n=new Es;const i=new it,r=new it,a=new xe,o=new Su,l=new bu,c={},h=e.maxTextureSize,f={[Ii]:nn,[nn]:Ii,[Xn]:Xn},u=new Fn({defines:{VSM_SAMPLES:8},uniforms:{shadow_pass:{value:null},resolution:{value:new it},radius:{value:4}},vertexShader:Jb,fragmentShader:Kb}),d=u.clone();d.defines.HORIZONTAL_PASS=1;const p=new Zt;p.setAttribute("position",new ue(new Float32Array([-1,-1,.5,3,-1,.5,-1,3,.5]),3));const _=new be(p,u),g=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=ea;let m=this.type;this.render=function(b,E,v){if(g.enabled===!1||g.autoUpdate===!1&&g.needsUpdate===!1||b.length===0)return;this.type===Vh&&(pt("WebGLShadowMap: PCFSoftShadowMap has been removed. Using PCFShadowMap instead."),this.type=ea);const T=s.getRenderTarget(),C=s.getActiveCubeFace(),P=s.getActiveMipmapLevel(),L=s.state;L.setBlending(oi),L.buffers.depth.getReversed()===!0?L.buffers.color.setClear(0,0,0,0):L.buffers.color.setClear(1,1,1,1),L.buffers.depth.setTest(!0),L.setScissorTest(!1);const N=m!==this.type;N&&E.traverse(function(D){D.material&&(Array.isArray(D.material)?D.material.forEach(O=>O.needsUpdate=!0):D.material.needsUpdate=!0)});for(let D=0,O=b.length;D<O;D++){const V=b[D],z=V.shadow;if(z===void 0){pt("WebGLShadowMap:",V,"has no shadow.");continue}if(z.autoUpdate===!1&&z.needsUpdate===!1)continue;i.copy(z.mapSize);const G=z.getFrameExtents();i.multiply(G),r.copy(z.mapSize),(i.x>h||i.y>h)&&(i.x>h&&(r.x=Math.floor(h/G.x),i.x=r.x*G.x,z.mapSize.x=r.x),i.y>h&&(r.y=Math.floor(h/G.y),i.y=r.y*G.y,z.mapSize.y=r.y));const X=s.state.buffers.depth.getReversed();if(z.camera._reversedDepth=X,z.map===null||N===!0){if(z.map!==null&&(z.map.depthTexture!==null&&(z.map.depthTexture.dispose(),z.map.depthTexture=null),z.map.dispose()),this.type===sr){if(V.isPointLight){pt("WebGLShadowMap: VSM shadow maps are not supported for PointLights. Use PCF or BasicShadowMap instead.");continue}z.map=new Mn(i.x,i.y,{format:Ji,type:Zn,minFilter:Ae,magFilter:Ae,generateMipmaps:!1}),z.map.texture.name=V.name+".shadowMap",z.map.depthTexture=new xr(i.x,i.y,un),z.map.depthTexture.name=V.name+".shadowMapDepth",z.map.depthTexture.format=ci,z.map.depthTexture.compareFunction=null,z.map.depthTexture.minFilter=Be,z.map.depthTexture.magFilter=Be}else V.isPointLight?(z.map=new Uu(i.x),z.map.depthTexture=new Op(i.x,Un)):(z.map=new Mn(i.x,i.y),z.map.depthTexture=new xr(i.x,i.y,Un)),z.map.depthTexture.name=V.name+".shadowMap",z.map.depthTexture.format=ci,this.type===ea?(z.map.depthTexture.compareFunction=X?$l:Zl,z.map.depthTexture.minFilter=Ae,z.map.depthTexture.magFilter=Ae):(z.map.depthTexture.compareFunction=null,z.map.depthTexture.minFilter=Be,z.map.depthTexture.magFilter=Be);z.camera.updateProjectionMatrix()}z.map.isWebGLCubeRenderTarget!==!0&&(z.map.width!==i.x||z.map.height!==i.y)&&z.map.setSize(i.x,i.y);const $=z.map.isWebGLCubeRenderTarget?6:z.getViewportCount();V.isPointLight!==!0&&z.updateMatrices(V,v);for(let Z=0;Z<$;Z++){const ct=z.getCamera(Z);if(V.isPointLight){const bt=z.camera,$t=z.matrix,Wt=V.distance||bt.far;Wt!==bt.far&&(bt.far=Wt,bt.updateProjectionMatrix()),Hr.setFromMatrixPosition(V.matrixWorld),bt.position.copy(Hr),_h.copy(bt.position),_h.add(Qb[Z]),bt.up.copy(jb[Z]),bt.lookAt(_h),bt.updateMatrixWorld(),$t.makeTranslation(-Hr.x,-Hr.y,-Hr.z),Uf.multiplyMatrices(bt.projectionMatrix,bt.matrixWorldInverse),z._frustum.setFromProjectionMatrix(Uf,bt.coordinateSystem,bt.reversedDepth)}if(z.map.isWebGLCubeRenderTarget)s.setRenderTarget(z.map,Z),s.clear();else{Z===0&&(s.setRenderTarget(z.map),s.clear());const bt=z.getViewport(Z);a.set(r.x*bt.x,r.y*bt.y,r.x*bt.z,r.y*bt.w),L.viewport(a)}n=z.getFrustum(Z),y(E,v,ct,V,this.type)}z.isPointLightShadow!==!0&&this.type===sr&&x(z,v),z.needsUpdate=!1}m=this.type,g.needsUpdate=!1,s.setRenderTarget(T,C,P)};function x(b,E){const v=t.update(_);u.defines.VSM_SAMPLES!==b.blurSamples&&(u.defines.VSM_SAMPLES=b.blurSamples,d.defines.VSM_SAMPLES=b.blurSamples,u.needsUpdate=!0,d.needsUpdate=!0),b.mapPass===null?b.mapPass=new Mn(i.x,i.y,{format:Ji,type:Zn}):(b.mapPass.width!==b.map.width||b.mapPass.height!==b.map.height)&&b.mapPass.setSize(b.map.width,b.map.height),u.uniforms.shadow_pass.value=b.map.depthTexture,u.uniforms.resolution.value.set(b.map.width,b.map.height),u.uniforms.radius.value=b.radius,s.setRenderTarget(b.mapPass),s.clear(),s.renderBufferDirect(E,null,v,u,_,null),d.uniforms.shadow_pass.value=b.mapPass.texture,d.uniforms.resolution.value.set(b.map.width,b.map.height),d.uniforms.radius.value=b.radius,s.setRenderTarget(b.map),s.clear(),s.renderBufferDirect(E,null,v,d,_,null)}function M(b,E,v,T){let C=null;const P=v.isPointLight===!0?b.customDistanceMaterial:b.customDepthMaterial;if(P!==void 0)C=P;else if(C=v.isPointLight===!0?l:o,s.localClippingEnabled&&E.clipShadows===!0&&Array.isArray(E.clippingPlanes)&&E.clippingPlanes.length!==0||E.displacementMap&&E.displacementScale!==0||E.alphaMap&&E.alphaTest>0||E.map&&E.alphaTest>0||E.alphaToCoverage===!0){const L=C.uuid,N=E.uuid;let D=c[L];D===void 0&&(D={},c[L]=D);let O=D[N];O===void 0&&(O=C.clone(),D[N]=O,E.addEventListener("dispose",w)),C=O}if(C.visible=E.visible,C.wireframe=E.wireframe,T===sr?C.side=E.shadowSide!==null?E.shadowSide:E.side:C.side=E.shadowSide!==null?E.shadowSide:f[E.side],C.alphaMap=E.alphaMap,C.alphaTest=E.alphaToCoverage===!0?.5:E.alphaTest,C.map=E.map,C.clipShadows=E.clipShadows,C.clippingPlanes=E.clippingPlanes,C.clipIntersection=E.clipIntersection,C.displacementMap=E.displacementMap,C.displacementScale=E.displacementScale,C.displacementBias=E.displacementBias,C.wireframeLinewidth=E.wireframeLinewidth,C.linewidth=E.linewidth,v.isPointLight===!0&&C.isMeshDistanceMaterial===!0){const L=s.properties.get(C);L.light=v}return C}function y(b,E,v,T,C){if(b.visible===!1)return;if(b.layers.test(E.layers)&&(b.isMesh||b.isLine||b.isPoints)&&(b.castShadow||b.receiveShadow&&C===sr)&&(!b.frustumCulled||b.intersectsFrustum(n))){b.modelViewMatrix.multiplyMatrices(v.matrixWorldInverse,b.matrixWorld);const N=t.update(b),D=b.material;if(Array.isArray(D)){const O=N.groups;for(let V=0,z=O.length;V<z;V++){const G=O[V],X=D[G.materialIndex];if(X&&X.visible){const $=M(b,X,T,C);b.onBeforeShadow(s,b,E,v,N,$,G),s.renderBufferDirect(v,null,N,$,b,G),b.onAfterShadow(s,b,E,v,N,$,G)}}}else if(D.visible){const O=M(b,D,T,C);b.onBeforeShadow(s,b,E,v,N,O,null),s.renderBufferDirect(v,null,N,O,b,null),b.onAfterShadow(s,b,E,v,N,O,null)}}const L=b.children;for(let N=0,D=L.length;N<D;N++)y(L[N],E,v,T,C)}function w(b){b.target.removeEventListener("dispose",w);for(const v in c){const T=c[v],C=b.target.uuid;C in T&&(T[C].dispose(),delete T[C])}}}function e1(s,t){function e(){let B=!1;const _t=new xe;let j=null;const xt=new xe(0,0,0,0);return{setMask:function(At){j!==At&&!B&&(s.colorMask(At,At,At,At),j=At)},setLocked:function(At){B=At},setClear:function(At,st,Ot,Lt,Me){Me===!0&&(At*=Lt,st*=Lt,Ot*=Lt),_t.set(At,st,Ot,Lt),xt.equals(_t)===!1&&(s.clearColor(At,st,Ot,Lt),xt.copy(_t))},reset:function(){B=!1,j=null,xt.set(-1,0,0,0)}}}function n(){let B=!1,_t=!1,j=null,xt=null,At=null;return{setReversed:function(st){if(_t!==st){const Ot=t.get("EXT_clip_control");st?Ot.clipControlEXT(Ot.LOWER_LEFT_EXT,Ot.ZERO_TO_ONE_EXT):Ot.clipControlEXT(Ot.LOWER_LEFT_EXT,Ot.NEGATIVE_ONE_TO_ONE_EXT),_t=st;const Lt=At;At=null,this.setClear(Lt)}},getReversed:function(){return _t},setTest:function(st){st?tt(s.DEPTH_TEST):ft(s.DEPTH_TEST)},setMask:function(st){j!==st&&!B&&(s.depthMask(st),j=st)},setFunc:function(st){if(_t&&(st=p0[st]),xt!==st){switch(st){case Xo:s.depthFunc(s.NEVER);break;case qo:s.depthFunc(s.ALWAYS);break;case Yo:s.depthFunc(s.LESS);break;case fr:s.depthFunc(s.LEQUAL);break;case Zo:s.depthFunc(s.EQUAL);break;case $o:s.depthFunc(s.GEQUAL);break;case Jo:s.depthFunc(s.GREATER);break;case Ko:s.depthFunc(s.NOTEQUAL);break;default:s.depthFunc(s.LEQUAL)}xt=st}},setLocked:function(st){B=st},setClear:function(st){At!==st&&(At=st,_t&&(st=1-st),s.clearDepth(st))},reset:function(){B=!1,j=null,xt=null,At=null,_t=!1}}}function i(){let B=!1,_t=null,j=null,xt=null,At=null,st=null,Ot=null,Lt=null,Me=null;return{setTest:function(fe){B||(fe?tt(s.STENCIL_TEST):ft(s.STENCIL_TEST))},setMask:function(fe){_t!==fe&&!B&&(s.stencilMask(fe),_t=fe)},setFunc:function(fe,Bn,Qn){(j!==fe||xt!==Bn||At!==Qn)&&(s.stencilFunc(fe,Bn,Qn),j=fe,xt=Bn,At=Qn)},setOp:function(fe,Bn,Qn){(st!==fe||Ot!==Bn||Lt!==Qn)&&(s.stencilOp(fe,Bn,Qn),st=fe,Ot=Bn,Lt=Qn)},setLocked:function(fe){B=fe},setClear:function(fe){Me!==fe&&(s.clearStencil(fe),Me=fe)},reset:function(){B=!1,_t=null,j=null,xt=null,At=null,st=null,Ot=null,Lt=null,Me=null}}}const r=new e,a=new n,o=new i,l=new WeakMap,c=new WeakMap;let h={},f={},u={},d=new WeakMap,p=[],_=null,g=!1,m=null,x=null,M=null,y=null,w=null,b=null,E=null,v=new ut(0,0,0),T=0,C=!1,P=null,L=null,N=null,D=null,O=null;const V=s.getParameter(s.MAX_COMBINED_TEXTURE_IMAGE_UNITS);let z=!1,G=0;const X=s.getParameter(s.VERSION);X.indexOf("WebGL")!==-1?(G=parseFloat(/^WebGL (\d)/.exec(X)[1]),z=G>=1):X.indexOf("OpenGL ES")!==-1&&(G=parseFloat(/^OpenGL ES (\d)/.exec(X)[1]),z=G>=2);let $=null,Z={};const ct=s.getParameter(s.SCISSOR_BOX),bt=s.getParameter(s.VIEWPORT),$t=new xe().fromArray(ct),Wt=new xe().fromArray(bt);function Qt(B,_t,j,xt){const At=new Uint8Array(4),st=s.createTexture();s.bindTexture(B,st),s.texParameteri(B,s.TEXTURE_MIN_FILTER,s.NEAREST),s.texParameteri(B,s.TEXTURE_MAG_FILTER,s.NEAREST);for(let Ot=0;Ot<j;Ot++)B===s.TEXTURE_3D||B===s.TEXTURE_2D_ARRAY?s.texImage3D(_t,0,s.RGBA,1,1,xt,0,s.RGBA,s.UNSIGNED_BYTE,At):s.texImage2D(_t+Ot,0,s.RGBA,1,1,0,s.RGBA,s.UNSIGNED_BYTE,At);return st}const K={};K[s.TEXTURE_2D]=Qt(s.TEXTURE_2D,s.TEXTURE_2D,1),K[s.TEXTURE_CUBE_MAP]=Qt(s.TEXTURE_CUBE_MAP,s.TEXTURE_CUBE_MAP_POSITIVE_X,6),K[s.TEXTURE_2D_ARRAY]=Qt(s.TEXTURE_2D_ARRAY,s.TEXTURE_2D_ARRAY,1,1),K[s.TEXTURE_3D]=Qt(s.TEXTURE_3D,s.TEXTURE_3D,1,1),r.setClear(0,0,0,1),a.setClear(1),o.setClear(0),tt(s.DEPTH_TEST),a.setFunc(fr),ot(!1),dt(yh),tt(s.CULL_FACE),rt(oi);function tt(B){h[B]!==!0&&(s.enable(B),h[B]=!0)}function ft(B){h[B]!==!1&&(s.disable(B),h[B]=!1)}function kt(B,_t){return u[B]!==_t?(s.bindFramebuffer(B,_t),u[B]=_t,B===s.DRAW_FRAMEBUFFER&&(u[s.FRAMEBUFFER]=_t),B===s.FRAMEBUFFER&&(u[s.DRAW_FRAMEBUFFER]=_t),!0):!1}function Tt(B,_t){let j=p,xt=!1;if(B){j=d.get(_t),j===void 0&&(j=[],d.set(_t,j));const At=B.textures;if(j.length!==At.length||j[0]!==s.COLOR_ATTACHMENT0){for(let st=0,Ot=At.length;st<Ot;st++)j[st]=s.COLOR_ATTACHMENT0+st;j.length=At.length,xt=!0}}else j[0]!==s.BACK&&(j[0]=s.BACK,xt=!0);xt&&s.drawBuffers(j)}function Xt(B){return _!==B?(s.useProgram(B),_=B,!0):!1}const ge={[xs]:s.FUNC_ADD,[qf]:s.FUNC_SUBTRACT,[Yf]:s.FUNC_REVERSE_SUBTRACT};ge[Zf]=s.MIN,ge[$f]=s.MAX;const nt={[Jf]:s.ZERO,[Kf]:s.ONE,[Qf]:s.SRC_COLOR,[Gh]:s.SRC_ALPHA,[sp]:s.SRC_ALPHA_SATURATE,[np]:s.DST_COLOR,[tp]:s.DST_ALPHA,[jf]:s.ONE_MINUS_SRC_COLOR,[Hh]:s.ONE_MINUS_SRC_ALPHA,[ip]:s.ONE_MINUS_DST_COLOR,[ep]:s.ONE_MINUS_DST_ALPHA,[rp]:s.CONSTANT_COLOR,[ap]:s.ONE_MINUS_CONSTANT_COLOR,[op]:s.CONSTANT_ALPHA,[lp]:s.ONE_MINUS_CONSTANT_ALPHA};function rt(B,_t,j,xt,At,st,Ot,Lt,Me,fe){if(B===oi){g===!0&&(ft(s.BLEND),g=!1);return}if(g===!1&&(tt(s.BLEND),g=!0),B!==Xf){if(B!==m||fe!==C){if((x!==xs||w!==xs)&&(s.blendEquation(s.FUNC_ADD),x=xs,w=xs),fe)switch(B){case cr:s.blendFuncSeparate(s.ONE,s.ONE_MINUS_SRC_ALPHA,s.ONE,s.ONE_MINUS_SRC_ALPHA);break;case vh:s.blendFunc(s.ONE,s.ONE);break;case Mh:s.blendFuncSeparate(s.ZERO,s.ONE_MINUS_SRC_COLOR,s.ZERO,s.ONE);break;case Sh:s.blendFuncSeparate(s.DST_COLOR,s.ONE_MINUS_SRC_ALPHA,s.ZERO,s.ONE);break;default:Nt("WebGLState: Invalid blending: ",B);break}else switch(B){case cr:s.blendFuncSeparate(s.SRC_ALPHA,s.ONE_MINUS_SRC_ALPHA,s.ONE,s.ONE_MINUS_SRC_ALPHA);break;case vh:s.blendFuncSeparate(s.SRC_ALPHA,s.ONE,s.ONE,s.ONE);break;case Mh:Nt("WebGLState: SubtractiveBlending requires material.premultipliedAlpha = true");break;case Sh:Nt("WebGLState: MultiplyBlending requires material.premultipliedAlpha = true");break;default:Nt("WebGLState: Invalid blending: ",B);break}M=null,y=null,b=null,E=null,v.set(0,0,0),T=0,m=B,C=fe}return}At=At||_t,st=st||j,Ot=Ot||xt,(_t!==x||At!==w)&&(s.blendEquationSeparate(ge[_t],ge[At]),x=_t,w=At),(j!==M||xt!==y||st!==b||Ot!==E)&&(s.blendFuncSeparate(nt[j],nt[xt],nt[st],nt[Ot]),M=j,y=xt,b=st,E=Ot),(Lt.equals(v)===!1||Me!==T)&&(s.blendColor(Lt.r,Lt.g,Lt.b,Me),v.copy(Lt),T=Me),m=B,C=!1}function at(B,_t){B.side===Xn?ft(s.CULL_FACE):tt(s.CULL_FACE);let j=B.side===nn;_t&&(j=!j),ot(j),B.blending===cr&&B.transparent===!1?rt(oi):rt(B.blending,B.blendEquation,B.blendSrc,B.blendDst,B.blendEquationAlpha,B.blendSrcAlpha,B.blendDstAlpha,B.blendColor,B.blendAlpha,B.premultipliedAlpha),a.setFunc(B.depthFunc),a.setTest(B.depthTest),a.setMask(B.depthWrite),r.setMask(B.colorWrite);const xt=B.stencilWrite;o.setTest(xt),xt&&(o.setMask(B.stencilWriteMask),o.setFunc(B.stencilFunc,B.stencilRef,B.stencilFuncMask),o.setOp(B.stencilFail,B.stencilZFail,B.stencilZPass)),Bt(B.polygonOffset,B.polygonOffsetFactor,B.polygonOffsetUnits),B.alphaToCoverage===!0?tt(s.SAMPLE_ALPHA_TO_COVERAGE):ft(s.SAMPLE_ALPHA_TO_COVERAGE)}function ot(B){P!==B&&(B?s.frontFace(s.CW):s.frontFace(s.CCW),P=B)}function dt(B){B!==Hf?(tt(s.CULL_FACE),B!==L&&(B===yh?s.cullFace(s.BACK):B===Wf?s.cullFace(s.FRONT):s.cullFace(s.FRONT_AND_BACK))):ft(s.CULL_FACE),L=B}function Vt(B){B!==N&&(z&&s.lineWidth(B),N=B)}function Bt(B,_t,j){B?(tt(s.POLYGON_OFFSET_FILL),(D!==_t||O!==j)&&(D=_t,O=j,a.getReversed()&&(_t=-_t),s.polygonOffset(_t,j))):ft(s.POLYGON_OFFSET_FILL)}function qt(B){B?tt(s.SCISSOR_TEST):ft(s.SCISSOR_TEST)}function Kt(B){B===void 0&&(B=s.TEXTURE0+V-1),$!==B&&(s.activeTexture(B),$=B)}function U(B,_t,j){j===void 0&&($===null?j=s.TEXTURE0+V-1:j=$);let xt=Z[j];xt===void 0&&(xt={type:void 0,texture:void 0},Z[j]=xt),(xt.type!==B||xt.texture!==_t)&&($!==j&&(s.activeTexture(j),$=j),s.bindTexture(B,_t||K[B]),xt.type=B,xt.texture=_t)}function de(){const B=Z[$];B!==void 0&&B.type!==void 0&&(s.bindTexture(B.type,null),B.type=void 0,B.texture=void 0)}function ie(){try{s.compressedTexImage2D(...arguments)}catch(B){Nt("WebGLState:",B)}}function R(){try{s.compressedTexImage3D(...arguments)}catch(B){Nt("WebGLState:",B)}}function S(){try{s.texSubImage2D(...arguments)}catch(B){Nt("WebGLState:",B)}}function k(){try{s.texSubImage3D(...arguments)}catch(B){Nt("WebGLState:",B)}}function q(){try{s.compressedTexSubImage2D(...arguments)}catch(B){Nt("WebGLState:",B)}}function J(){try{s.compressedTexSubImage3D(...arguments)}catch(B){Nt("WebGLState:",B)}}function lt(){try{s.texStorage2D(...arguments)}catch(B){Nt("WebGLState:",B)}}function ht(){try{s.texStorage3D(...arguments)}catch(B){Nt("WebGLState:",B)}}function Q(){try{s.texImage2D(...arguments)}catch(B){Nt("WebGLState:",B)}}function et(){try{s.texImage3D(...arguments)}catch(B){Nt("WebGLState:",B)}}function mt(B){return f[B]!==void 0?f[B]:s.getParameter(B)}function Ut(B,_t){f[B]!==_t&&(s.pixelStorei(B,_t),f[B]=_t)}function vt(B){$t.equals(B)===!1&&(s.scissor(B.x,B.y,B.z,B.w),$t.copy(B))}function gt(B){Wt.equals(B)===!1&&(s.viewport(B.x,B.y,B.z,B.w),Wt.copy(B))}function Ft(B,_t){let j=c.get(_t);j===void 0&&(j=new WeakMap,c.set(_t,j));let xt=j.get(B);xt===void 0&&(xt=s.getUniformBlockIndex(_t,B.name),j.set(B,xt))}function Gt(B,_t){const xt=c.get(_t).get(B);l.get(_t)!==xt&&(s.uniformBlockBinding(_t,xt,B.__bindingPointIndex),l.set(_t,xt))}function jt(){s.disable(s.BLEND),s.disable(s.CULL_FACE),s.disable(s.DEPTH_TEST),s.disable(s.POLYGON_OFFSET_FILL),s.disable(s.SCISSOR_TEST),s.disable(s.STENCIL_TEST),s.disable(s.SAMPLE_ALPHA_TO_COVERAGE),s.blendEquation(s.FUNC_ADD),s.blendFunc(s.ONE,s.ZERO),s.blendFuncSeparate(s.ONE,s.ZERO,s.ONE,s.ZERO),s.blendColor(0,0,0,0),s.colorMask(!0,!0,!0,!0),s.clearColor(0,0,0,0),s.depthMask(!0),s.depthFunc(s.LESS),a.setReversed(!1),s.clearDepth(1),s.stencilMask(4294967295),s.stencilFunc(s.ALWAYS,0,4294967295),s.stencilOp(s.KEEP,s.KEEP,s.KEEP),s.clearStencil(0),s.cullFace(s.BACK),s.frontFace(s.CCW),s.polygonOffset(0,0),s.activeTexture(s.TEXTURE0),s.bindFramebuffer(s.FRAMEBUFFER,null),s.bindFramebuffer(s.DRAW_FRAMEBUFFER,null),s.bindFramebuffer(s.READ_FRAMEBUFFER,null),s.useProgram(null),s.lineWidth(1),s.scissor(0,0,s.canvas.width,s.canvas.height),s.viewport(0,0,s.canvas.width,s.canvas.height),s.pixelStorei(s.PACK_ALIGNMENT,4),s.pixelStorei(s.UNPACK_ALIGNMENT,4),s.pixelStorei(s.UNPACK_FLIP_Y_WEBGL,!1),s.pixelStorei(s.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!1),s.pixelStorei(s.UNPACK_COLORSPACE_CONVERSION_WEBGL,s.BROWSER_DEFAULT_WEBGL),s.pixelStorei(s.PACK_ROW_LENGTH,0),s.pixelStorei(s.PACK_SKIP_PIXELS,0),s.pixelStorei(s.PACK_SKIP_ROWS,0),s.pixelStorei(s.UNPACK_ROW_LENGTH,0),s.pixelStorei(s.UNPACK_IMAGE_HEIGHT,0),s.pixelStorei(s.UNPACK_SKIP_PIXELS,0),s.pixelStorei(s.UNPACK_SKIP_ROWS,0),s.pixelStorei(s.UNPACK_SKIP_IMAGES,0),h={},f={},$=null,Z={},u={},d=new WeakMap,p=[],_=null,g=!1,m=null,x=null,M=null,y=null,w=null,b=null,E=null,v=new ut(0,0,0),T=0,C=!1,P=null,L=null,N=null,D=null,O=null,$t.set(0,0,s.canvas.width,s.canvas.height),Wt.set(0,0,s.canvas.width,s.canvas.height),r.reset(),a.reset(),o.reset()}return{buffers:{color:r,depth:a,stencil:o},enable:tt,disable:ft,bindFramebuffer:kt,drawBuffers:Tt,useProgram:Xt,setBlending:rt,setMaterial:at,setFlipSided:ot,setCullFace:dt,setLineWidth:Vt,setPolygonOffset:Bt,setScissorTest:qt,activeTexture:Kt,bindTexture:U,unbindTexture:de,compressedTexImage2D:ie,compressedTexImage3D:R,texImage2D:Q,texImage3D:et,pixelStorei:Ut,getParameter:mt,updateUBOMapping:Ft,uniformBlockBinding:Gt,texStorage2D:lt,texStorage3D:ht,texSubImage2D:S,texSubImage3D:k,compressedTexSubImage2D:q,compressedTexSubImage3D:J,scissor:vt,viewport:gt,reset:jt}}function n1(s,t,e,n,i,r,a){const o=t.has("WEBGL_multisampled_render_to_texture")?t.get("WEBGL_multisampled_render_to_texture"):null,l=typeof navigator>"u"?!1:/OculusBrowser/g.test(navigator.userAgent),c=new it,h=new WeakMap,f=new Set;let u;const d=new WeakMap;let p=!1;try{p=typeof OffscreenCanvas<"u"&&new OffscreenCanvas(1,1).getContext("2d")!==null}catch{}function _(R,S){return p?new OffscreenCanvas(R,S):Sa("canvas")}function g(R,S,k){let q=1;const J=ie(R);if((J.width>k||J.height>k)&&(q=k/Math.max(J.width,J.height)),q<1)if(typeof HTMLImageElement<"u"&&R instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&R instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&R instanceof ImageBitmap||typeof VideoFrame<"u"&&R instanceof VideoFrame){const lt=Math.floor(q*J.width),ht=Math.floor(q*J.height);u===void 0&&(u=_(lt,ht));const Q=S?_(lt,ht):u;return Q.width=lt,Q.height=ht,Q.getContext("2d").drawImage(R,0,0,lt,ht),pt("WebGLRenderer: Texture has been resized from ("+J.width+"x"+J.height+") to ("+lt+"x"+ht+")."),Q}else return"data"in R&&pt("WebGLRenderer: Image in DataTexture is too big ("+J.width+"x"+J.height+")."),R;return R}function m(R){return R.generateMipmaps}function x(R){s.generateMipmap(R)}function M(R){return R.isWebGLCubeRenderTarget?s.TEXTURE_CUBE_MAP:R.isWebGL3DRenderTarget?s.TEXTURE_3D:R.isWebGLArrayRenderTarget||R.isCompressedArrayTexture?s.TEXTURE_2D_ARRAY:s.TEXTURE_2D}function y(R,S,k,q,J,lt=!1){if(R!==null){if(s[R]!==void 0)return s[R];pt("WebGLRenderer: Attempt to use non-existing WebGL internal format '"+R+"'")}let ht;q&&(ht=t.get("EXT_texture_norm16"),ht||pt("WebGLRenderer: Unable to use normalized textures without EXT_texture_norm16 extension"));let Q=S;if(S===s.RED&&(k===s.FLOAT&&(Q=s.R32F),k===s.HALF_FLOAT&&(Q=s.R16F),k===s.UNSIGNED_BYTE&&(Q=s.R8),k===s.UNSIGNED_SHORT&&ht&&(Q=ht.R16_EXT),k===s.SHORT&&ht&&(Q=ht.R16_SNORM_EXT)),S===s.RED_INTEGER&&(k===s.UNSIGNED_BYTE&&(Q=s.R8UI),k===s.UNSIGNED_SHORT&&(Q=s.R16UI),k===s.UNSIGNED_INT&&(Q=s.R32UI),k===s.BYTE&&(Q=s.R8I),k===s.SHORT&&(Q=s.R16I),k===s.INT&&(Q=s.R32I)),S===s.RG&&(k===s.FLOAT&&(Q=s.RG32F),k===s.HALF_FLOAT&&(Q=s.RG16F),k===s.UNSIGNED_BYTE&&(Q=s.RG8),k===s.UNSIGNED_SHORT&&ht&&(Q=ht.RG16_EXT),k===s.SHORT&&ht&&(Q=ht.RG16_SNORM_EXT)),S===s.RG_INTEGER&&(k===s.UNSIGNED_BYTE&&(Q=s.RG8UI),k===s.UNSIGNED_SHORT&&(Q=s.RG16UI),k===s.UNSIGNED_INT&&(Q=s.RG32UI),k===s.BYTE&&(Q=s.RG8I),k===s.SHORT&&(Q=s.RG16I),k===s.INT&&(Q=s.RG32I)),S===s.RGB_INTEGER&&(k===s.UNSIGNED_BYTE&&(Q=s.RGB8UI),k===s.UNSIGNED_SHORT&&(Q=s.RGB16UI),k===s.UNSIGNED_INT&&(Q=s.RGB32UI),k===s.BYTE&&(Q=s.RGB8I),k===s.SHORT&&(Q=s.RGB16I),k===s.INT&&(Q=s.RGB32I)),S===s.RGBA_INTEGER&&(k===s.UNSIGNED_BYTE&&(Q=s.RGBA8UI),k===s.UNSIGNED_SHORT&&(Q=s.RGBA16UI),k===s.UNSIGNED_INT&&(Q=s.RGBA32UI),k===s.BYTE&&(Q=s.RGBA8I),k===s.SHORT&&(Q=s.RGBA16I),k===s.INT&&(Q=s.RGBA32I)),S===s.RGB&&(k===s.UNSIGNED_SHORT&&ht&&(Q=ht.RGB16_EXT),k===s.SHORT&&ht&&(Q=ht.RGB16_SNORM_EXT),k===s.UNSIGNED_INT_5_9_9_9_REV&&(Q=s.RGB9_E5),k===s.UNSIGNED_INT_10F_11F_11F_REV&&(Q=s.R11F_G11F_B10F)),S===s.RGBA){const et=lt?Ma:ae.getTransfer(J);k===s.FLOAT&&(Q=s.RGBA32F),k===s.HALF_FLOAT&&(Q=s.RGBA16F),k===s.UNSIGNED_BYTE&&(Q=et===me?s.SRGB8_ALPHA8:s.RGBA8),k===s.UNSIGNED_SHORT&&ht&&(Q=ht.RGBA16_EXT),k===s.SHORT&&ht&&(Q=ht.RGBA16_SNORM_EXT),k===s.UNSIGNED_SHORT_4_4_4_4&&(Q=s.RGBA4),k===s.UNSIGNED_SHORT_5_5_5_1&&(Q=s.RGB5_A1)}return(Q===s.R16F||Q===s.R32F||Q===s.RG16F||Q===s.RG32F||Q===s.RGBA16F||Q===s.RGBA32F)&&t.get("EXT_color_buffer_float"),Q}function w(R,S){let k;return R?S===null||S===Un||S===mr?k=s.DEPTH24_STENCIL8:S===un?k=s.DEPTH32F_STENCIL8:S===pr&&(k=s.DEPTH24_STENCIL8,pt("DepthTexture: 16 bit depth attachment is not supported with stencil. Using 24-bit attachment.")):S===null||S===Un||S===mr?k=s.DEPTH_COMPONENT24:S===un?k=s.DEPTH_COMPONENT32F:S===pr&&(k=s.DEPTH_COMPONENT16),k}function b(R,S){return m(R)===!0||R.isFramebufferTexture&&R.minFilter!==Be&&R.minFilter!==Ae?Math.log2(Math.max(S.width,S.height))+1:R.mipmaps!==void 0&&R.mipmaps.length>0?R.mipmaps.length:R.isCompressedTexture&&Array.isArray(R.image)?S.mipmaps.length:1}function E(R){const S=R.target;S.removeEventListener("dispose",E),T(S),S.isVideoTexture&&h.delete(S),S.isHTMLTexture&&f.delete(S)}function v(R){const S=R.target;S.removeEventListener("dispose",v),P(S)}function T(R){const S=n.get(R);if(S.__webglInit===void 0)return;const k=R.source,q=d.get(k);if(q){const J=q[S.__cacheKey];J.usedTimes--,J.usedTimes===0&&C(R),Object.keys(q).length===0&&d.delete(k)}n.remove(R)}function C(R){const S=n.get(R);s.deleteTexture(S.__webglTexture);const k=R.source,q=d.get(k);delete q[S.__cacheKey],a.memory.textures--}function P(R){const S=n.get(R);if(R.depthTexture&&(R.depthTexture.dispose(),n.remove(R.depthTexture)),R.isWebGLCubeRenderTarget)for(let q=0;q<6;q++){if(Array.isArray(S.__webglFramebuffer[q]))for(let J=0;J<S.__webglFramebuffer[q].length;J++)s.deleteFramebuffer(S.__webglFramebuffer[q][J]);else s.deleteFramebuffer(S.__webglFramebuffer[q]);S.__webglDepthbuffer&&s.deleteRenderbuffer(S.__webglDepthbuffer[q])}else{if(Array.isArray(S.__webglFramebuffer))for(let q=0;q<S.__webglFramebuffer.length;q++)s.deleteFramebuffer(S.__webglFramebuffer[q]);else s.deleteFramebuffer(S.__webglFramebuffer);if(S.__webglDepthbuffer&&s.deleteRenderbuffer(S.__webglDepthbuffer),S.__webglMultisampledFramebuffer&&s.deleteFramebuffer(S.__webglMultisampledFramebuffer),S.__webglColorRenderbuffer)for(let q=0;q<S.__webglColorRenderbuffer.length;q++)S.__webglColorRenderbuffer[q]&&s.deleteRenderbuffer(S.__webglColorRenderbuffer[q]);S.__webglDepthRenderbuffer&&s.deleteRenderbuffer(S.__webglDepthRenderbuffer)}const k=R.textures;for(let q=0,J=k.length;q<J;q++){const lt=n.get(k[q]);lt.__webglTexture&&(s.deleteTexture(lt.__webglTexture),a.memory.textures--),n.remove(k[q])}n.remove(R)}let L=0;function N(){L=0}function D(){return L}function O(R){L=R}function V(){const R=L;return R>=i.maxTextures&&pt("WebGLTextures: Trying to use "+(R+1)+" texture units while this GPU supports only "+i.maxTextures),L+=1,R}function z(R){const S=[];return S.push(R.wrapS),S.push(R.wrapT),S.push(R.wrapR||0),S.push(R.magFilter),S.push(R.minFilter),S.push(R.anisotropy),S.push(R.internalFormat),S.push(R.format),S.push(R.type),S.push(R.generateMipmaps),S.push(R.premultiplyAlpha),S.push(R.flipY),S.push(R.unpackAlignment),S.push(R.colorSpace),S.join()}function G(R,S){const k=n.get(R);if(R.isVideoTexture&&U(R),R.isRenderTargetTexture===!1&&R.isExternalTexture!==!0&&R.version>0&&k.__version!==R.version){const q=R.image;if(q===null)pt("WebGLRenderer: Texture marked for update but no image data found.");else if(q.complete===!1)pt("WebGLRenderer: Texture marked for update but image is incomplete");else{ft(k,R,S);return}}else R.isExternalTexture&&(k.__webglTexture=R.sourceTexture?R.sourceTexture:null);e.bindTexture(s.TEXTURE_2D,k.__webglTexture,s.TEXTURE0+S)}function X(R,S){const k=n.get(R);if(R.isRenderTargetTexture===!1&&R.version>0&&k.__version!==R.version){ft(k,R,S);return}else R.isExternalTexture&&(k.__webglTexture=R.sourceTexture?R.sourceTexture:null);e.bindTexture(s.TEXTURE_2D_ARRAY,k.__webglTexture,s.TEXTURE0+S)}function $(R,S){const k=n.get(R);if(R.isRenderTargetTexture===!1&&R.version>0&&k.__version!==R.version){ft(k,R,S);return}e.bindTexture(s.TEXTURE_3D,k.__webglTexture,s.TEXTURE0+S)}function Z(R,S){const k=n.get(R);if(R.isCubeDepthTexture!==!0&&R.version>0&&k.__version!==R.version){kt(k,R,S);return}e.bindTexture(s.TEXTURE_CUBE_MAP,k.__webglTexture,s.TEXTURE0+S)}const ct={[pa]:s.REPEAT,[yn]:s.CLAMP_TO_EDGE,[ma]:s.MIRRORED_REPEAT},bt={[Be]:s.NEAREST,[Jh]:s.NEAREST_MIPMAP_NEAREST,[rr]:s.NEAREST_MIPMAP_LINEAR,[Ae]:s.LINEAR,[sa]:s.LINEAR_MIPMAP_NEAREST,[ri]:s.LINEAR_MIPMAP_LINEAR},$t={[xp]:s.NEVER,[bp]:s.ALWAYS,[yp]:s.LESS,[Zl]:s.LEQUAL,[vp]:s.EQUAL,[$l]:s.GEQUAL,[Mp]:s.GREATER,[Sp]:s.NOTEQUAL};function Wt(R,S){if(S.type===un&&t.has("OES_texture_float_linear")===!1&&(S.magFilter===Ae||S.magFilter===sa||S.magFilter===rr||S.magFilter===ri||S.minFilter===Ae||S.minFilter===sa||S.minFilter===rr||S.minFilter===ri)&&pt("WebGLRenderer: Unable to use linear filtering with floating point textures. OES_texture_float_linear not supported on this device."),s.texParameteri(R,s.TEXTURE_WRAP_S,ct[S.wrapS]),s.texParameteri(R,s.TEXTURE_WRAP_T,ct[S.wrapT]),(R===s.TEXTURE_3D||R===s.TEXTURE_2D_ARRAY)&&s.texParameteri(R,s.TEXTURE_WRAP_R,ct[S.wrapR]),s.texParameteri(R,s.TEXTURE_MAG_FILTER,bt[S.magFilter]),s.texParameteri(R,s.TEXTURE_MIN_FILTER,bt[S.minFilter]),S.compareFunction&&(s.texParameteri(R,s.TEXTURE_COMPARE_MODE,s.COMPARE_REF_TO_TEXTURE),s.texParameteri(R,s.TEXTURE_COMPARE_FUNC,$t[S.compareFunction])),t.has("EXT_texture_filter_anisotropic")===!0){if(S.magFilter===Be||S.minFilter!==rr&&S.minFilter!==ri||S.type===un&&t.has("OES_texture_float_linear")===!1)return;if(S.anisotropy>1||n.get(S).__currentAnisotropy){const k=t.get("EXT_texture_filter_anisotropic");s.texParameterf(R,k.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(S.anisotropy,i.getMaxAnisotropy())),n.get(S).__currentAnisotropy=S.anisotropy}}}function Qt(R,S){let k=!1;R.__webglInit===void 0&&(R.__webglInit=!0,S.addEventListener("dispose",E));const q=S.source;let J=d.get(q);J===void 0&&(J={},d.set(q,J));const lt=z(S);if(lt!==R.__cacheKey){J[lt]===void 0&&(J[lt]={texture:s.createTexture(),usedTimes:0},a.memory.textures++,k=!0),J[lt].usedTimes++;const ht=J[R.__cacheKey];ht!==void 0&&(J[R.__cacheKey].usedTimes--,ht.usedTimes===0&&C(S)),R.__cacheKey=lt,R.__webglTexture=J[lt].texture}return k}function K(R,S,k){return Math.floor(Math.floor(R/k)/S)}function tt(R,S,k,q){const lt=R.updateRanges;if(lt.length===0)e.texSubImage2D(s.TEXTURE_2D,0,0,0,S.width,S.height,k,q,S.data);else{lt.sort((Ut,vt)=>Ut.start-vt.start);let ht=0;for(let Ut=1;Ut<lt.length;Ut++){const vt=lt[ht],gt=lt[Ut],Ft=vt.start+vt.count,Gt=K(gt.start,S.width,4),jt=K(vt.start,S.width,4);gt.start<=Ft+1&&Gt===jt&&K(gt.start+gt.count-1,S.width,4)===Gt?vt.count=Math.max(vt.count,gt.start+gt.count-vt.start):(++ht,lt[ht]=gt)}lt.length=ht+1;const Q=e.getParameter(s.UNPACK_ROW_LENGTH),et=e.getParameter(s.UNPACK_SKIP_PIXELS),mt=e.getParameter(s.UNPACK_SKIP_ROWS);e.pixelStorei(s.UNPACK_ROW_LENGTH,S.width);for(let Ut=0,vt=lt.length;Ut<vt;Ut++){const gt=lt[Ut],Ft=Math.floor(gt.start/4),Gt=Math.ceil(gt.count/4),jt=Ft%S.width,B=Math.floor(Ft/S.width),_t=Gt,j=1;e.pixelStorei(s.UNPACK_SKIP_PIXELS,jt),e.pixelStorei(s.UNPACK_SKIP_ROWS,B),e.texSubImage2D(s.TEXTURE_2D,0,jt,B,_t,j,k,q,S.data)}R.clearUpdateRanges(),e.pixelStorei(s.UNPACK_ROW_LENGTH,Q),e.pixelStorei(s.UNPACK_SKIP_PIXELS,et),e.pixelStorei(s.UNPACK_SKIP_ROWS,mt)}}function ft(R,S,k){let q=s.TEXTURE_2D;(S.isDataArrayTexture||S.isCompressedArrayTexture)&&(q=s.TEXTURE_2D_ARRAY),S.isData3DTexture&&(q=s.TEXTURE_3D);const J=Qt(R,S),lt=S.source;e.bindTexture(q,R.__webglTexture,s.TEXTURE0+k);const ht=n.get(lt);if(lt.version!==ht.__version||J===!0){if(e.activeTexture(s.TEXTURE0+k),(typeof ImageBitmap<"u"&&S.image instanceof ImageBitmap)===!1){const j=ae.getPrimaries(ae.workingColorSpace),xt=S.colorSpace===Si?null:ae.getPrimaries(S.colorSpace),At=S.colorSpace===Si||j===xt?s.NONE:s.BROWSER_DEFAULT_WEBGL;e.pixelStorei(s.UNPACK_FLIP_Y_WEBGL,S.flipY),e.pixelStorei(s.UNPACK_PREMULTIPLY_ALPHA_WEBGL,S.premultiplyAlpha),e.pixelStorei(s.UNPACK_COLORSPACE_CONVERSION_WEBGL,At)}e.pixelStorei(s.UNPACK_ALIGNMENT,S.unpackAlignment);let et=g(S.image,!1,i.maxTextureSize);et=de(S,et);const mt=r.convert(S.format,S.colorSpace),Ut=r.convert(S.type);let vt=y(S.internalFormat,mt,Ut,S.normalized,S.colorSpace,S.isVideoTexture);Wt(q,S);let gt;const Ft=S.mipmaps,Gt=S.isVideoTexture!==!0,jt=ht.__version===void 0||J===!0,B=lt.dataReady,_t=b(S,et);if(S.isDepthTexture)vt=w(S.format===Xi,S.type),jt&&(Gt?e.texStorage2D(s.TEXTURE_2D,1,vt,et.width,et.height):e.texImage2D(s.TEXTURE_2D,0,vt,et.width,et.height,0,mt,Ut,null));else if(S.isDataTexture)if(Ft.length>0){Gt&&jt&&e.texStorage2D(s.TEXTURE_2D,_t,vt,Ft[0].width,Ft[0].height);for(let j=0,xt=Ft.length;j<xt;j++)gt=Ft[j],Gt?B&&e.texSubImage2D(s.TEXTURE_2D,j,0,0,gt.width,gt.height,mt,Ut,gt.data):e.texImage2D(s.TEXTURE_2D,j,vt,gt.width,gt.height,0,mt,Ut,gt.data);S.generateMipmaps=!1}else Gt?(jt&&e.texStorage2D(s.TEXTURE_2D,_t,vt,et.width,et.height),B&&tt(S,et,mt,Ut)):e.texImage2D(s.TEXTURE_2D,0,vt,et.width,et.height,0,mt,Ut,et.data);else if(S.isCompressedTexture)if(S.isCompressedArrayTexture){Gt&&jt&&e.texStorage3D(s.TEXTURE_2D_ARRAY,_t,vt,Ft[0].width,Ft[0].height,et.depth);for(let j=0,xt=Ft.length;j<xt;j++)if(gt=Ft[j],S.format!==dn)if(mt!==null)if(Gt){if(B)if(S.layerUpdates.size>0){const At=Dh(gt.width,gt.height,S.format,S.type);for(const st of S.layerUpdates){const Ot=gt.data.subarray(st*At/gt.data.BYTES_PER_ELEMENT,(st+1)*At/gt.data.BYTES_PER_ELEMENT);e.compressedTexSubImage3D(s.TEXTURE_2D_ARRAY,j,0,0,st,gt.width,gt.height,1,mt,Ot)}}else e.compressedTexSubImage3D(s.TEXTURE_2D_ARRAY,j,0,0,0,gt.width,gt.height,et.depth,mt,gt.data)}else e.compressedTexImage3D(s.TEXTURE_2D_ARRAY,j,vt,gt.width,gt.height,et.depth,0,gt.data,0,0);else pt("WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()");else Gt?B&&e.texSubImage3D(s.TEXTURE_2D_ARRAY,j,0,0,0,gt.width,gt.height,et.depth,mt,Ut,gt.data):e.texImage3D(s.TEXTURE_2D_ARRAY,j,vt,gt.width,gt.height,et.depth,0,mt,Ut,gt.data);S.layerUpdates.size>0&&S.clearLayerUpdates()}else{Gt&&jt&&e.texStorage2D(s.TEXTURE_2D,_t,vt,Ft[0].width,Ft[0].height);for(let j=0,xt=Ft.length;j<xt;j++)gt=Ft[j],S.format!==dn?mt!==null?Gt?B&&e.compressedTexSubImage2D(s.TEXTURE_2D,j,0,0,gt.width,gt.height,mt,gt.data):e.compressedTexImage2D(s.TEXTURE_2D,j,vt,gt.width,gt.height,0,gt.data):pt("WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()"):Gt?B&&e.texSubImage2D(s.TEXTURE_2D,j,0,0,gt.width,gt.height,mt,Ut,gt.data):e.texImage2D(s.TEXTURE_2D,j,vt,gt.width,gt.height,0,mt,Ut,gt.data)}else if(S.isDataArrayTexture)if(Gt){if(jt&&e.texStorage3D(s.TEXTURE_2D_ARRAY,_t,vt,et.width,et.height,et.depth),B)if(S.layerUpdates.size>0){const j=Dh(et.width,et.height,S.format,S.type);for(const xt of S.layerUpdates){const At=et.data.subarray(xt*j/et.data.BYTES_PER_ELEMENT,(xt+1)*j/et.data.BYTES_PER_ELEMENT);e.texSubImage3D(s.TEXTURE_2D_ARRAY,0,0,0,xt,et.width,et.height,1,mt,Ut,At)}S.clearLayerUpdates()}else e.texSubImage3D(s.TEXTURE_2D_ARRAY,0,0,0,0,et.width,et.height,et.depth,mt,Ut,et.data)}else e.texImage3D(s.TEXTURE_2D_ARRAY,0,vt,et.width,et.height,et.depth,0,mt,Ut,et.data);else if(S.isData3DTexture)Gt?(jt&&e.texStorage3D(s.TEXTURE_3D,_t,vt,et.width,et.height,et.depth),B&&e.texSubImage3D(s.TEXTURE_3D,0,0,0,0,et.width,et.height,et.depth,mt,Ut,et.data)):e.texImage3D(s.TEXTURE_3D,0,vt,et.width,et.height,et.depth,0,mt,Ut,et.data);else if(S.isFramebufferTexture){if(jt)if(Gt)e.texStorage2D(s.TEXTURE_2D,_t,vt,et.width,et.height);else{let j=et.width,xt=et.height;for(let At=0;At<_t;At++)e.texImage2D(s.TEXTURE_2D,At,vt,j,xt,0,mt,Ut,null),j>>=1,xt>>=1}}else if(S.isHTMLTexture){if("texElementImage2D"in s){const j=s.canvas;if(j.hasAttribute("layoutsubtree")||j.setAttribute("layoutsubtree","true"),et.parentNode!==j){j.appendChild(et),f.add(S),j.onpaint=xt=>{const At=xt.changedElements;for(const st of f)At.includes(st.image)&&(st.needsUpdate=!0)},j.requestPaint();return}if(s.texElementImage2D.length===3)s.texElementImage2D(s.TEXTURE_2D,s.RGBA8,et);else{const At=s.RGBA,st=s.RGBA,Ot=s.UNSIGNED_BYTE;s.texElementImage2D(s.TEXTURE_2D,0,At,st,Ot,et)}s.texParameteri(s.TEXTURE_2D,s.TEXTURE_MIN_FILTER,s.LINEAR),s.texParameteri(s.TEXTURE_2D,s.TEXTURE_WRAP_S,s.CLAMP_TO_EDGE),s.texParameteri(s.TEXTURE_2D,s.TEXTURE_WRAP_T,s.CLAMP_TO_EDGE)}}else if(Ft.length>0){if(Gt&&jt){const j=ie(Ft[0]);e.texStorage2D(s.TEXTURE_2D,_t,vt,j.width,j.height)}for(let j=0,xt=Ft.length;j<xt;j++)gt=Ft[j],Gt?B&&e.texSubImage2D(s.TEXTURE_2D,j,0,0,mt,Ut,gt):e.texImage2D(s.TEXTURE_2D,j,vt,mt,Ut,gt);S.generateMipmaps=!1}else if(Gt){if(jt){const j=ie(et);e.texStorage2D(s.TEXTURE_2D,_t,vt,j.width,j.height)}B&&e.texSubImage2D(s.TEXTURE_2D,0,0,0,mt,Ut,et)}else e.texImage2D(s.TEXTURE_2D,0,vt,mt,Ut,et);m(S)&&x(q),ht.__version=lt.version,S.onUpdate&&S.onUpdate(S)}R.__version=S.version}function kt(R,S,k){if(S.image.length!==6)return;const q=Qt(R,S),J=S.source;e.bindTexture(s.TEXTURE_CUBE_MAP,R.__webglTexture,s.TEXTURE0+k);const lt=n.get(J);if(J.version!==lt.__version||q===!0){e.activeTexture(s.TEXTURE0+k);const ht=ae.getPrimaries(ae.workingColorSpace),Q=S.colorSpace===Si?null:ae.getPrimaries(S.colorSpace),et=S.colorSpace===Si||ht===Q?s.NONE:s.BROWSER_DEFAULT_WEBGL;e.pixelStorei(s.UNPACK_FLIP_Y_WEBGL,S.flipY),e.pixelStorei(s.UNPACK_PREMULTIPLY_ALPHA_WEBGL,S.premultiplyAlpha),e.pixelStorei(s.UNPACK_ALIGNMENT,S.unpackAlignment),e.pixelStorei(s.UNPACK_COLORSPACE_CONVERSION_WEBGL,et);const mt=S.isCompressedTexture||S.image[0].isCompressedTexture,Ut=S.image[0]&&S.image[0].isDataTexture,vt=[];for(let st=0;st<6;st++)!mt&&!Ut?vt[st]=g(S.image[st],!0,i.maxCubemapSize):vt[st]=Ut?S.image[st].image:S.image[st],vt[st]=de(S,vt[st]);const gt=vt[0],Ft=r.convert(S.format,S.colorSpace),Gt=r.convert(S.type),jt=y(S.internalFormat,Ft,Gt,S.normalized,S.colorSpace),B=S.isVideoTexture!==!0,_t=lt.__version===void 0||q===!0,j=J.dataReady;let xt=b(S,gt);Wt(s.TEXTURE_CUBE_MAP,S);let At;if(mt){B&&_t&&e.texStorage2D(s.TEXTURE_CUBE_MAP,xt,jt,gt.width,gt.height);for(let st=0;st<6;st++){At=vt[st].mipmaps;for(let Ot=0;Ot<At.length;Ot++){const Lt=At[Ot];S.format!==dn?Ft!==null?B?j&&e.compressedTexSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+st,Ot,0,0,Lt.width,Lt.height,Ft,Lt.data):e.compressedTexImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+st,Ot,jt,Lt.width,Lt.height,0,Lt.data):pt("WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()"):B?j&&e.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+st,Ot,0,0,Lt.width,Lt.height,Ft,Gt,Lt.data):e.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+st,Ot,jt,Lt.width,Lt.height,0,Ft,Gt,Lt.data)}}}else{if(At=S.mipmaps,B&&_t){At.length>0&&xt++;const st=ie(vt[0]);e.texStorage2D(s.TEXTURE_CUBE_MAP,xt,jt,st.width,st.height)}for(let st=0;st<6;st++)if(Ut){B?j&&e.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+st,0,0,0,vt[st].width,vt[st].height,Ft,Gt,vt[st].data):e.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+st,0,jt,vt[st].width,vt[st].height,0,Ft,Gt,vt[st].data);for(let Ot=0;Ot<At.length;Ot++){const Me=At[Ot].image[st].image;B?j&&e.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+st,Ot+1,0,0,Me.width,Me.height,Ft,Gt,Me.data):e.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+st,Ot+1,jt,Me.width,Me.height,0,Ft,Gt,Me.data)}}else{B?j&&e.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+st,0,0,0,Ft,Gt,vt[st]):e.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+st,0,jt,Ft,Gt,vt[st]);for(let Ot=0;Ot<At.length;Ot++){const Lt=At[Ot];B?j&&e.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+st,Ot+1,0,0,Ft,Gt,Lt.image[st]):e.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+st,Ot+1,jt,Ft,Gt,Lt.image[st])}}}m(S)&&x(s.TEXTURE_CUBE_MAP),lt.__version=J.version,S.onUpdate&&S.onUpdate(S)}R.__version=S.version}function Tt(R,S,k,q,J,lt){const ht=r.convert(k.format,k.colorSpace),Q=r.convert(k.type),et=y(k.internalFormat,ht,Q,k.normalized,k.colorSpace),mt=n.get(S),Ut=n.get(k);if(Ut.__renderTarget=S,!mt.__hasExternalTextures){const vt=Math.max(1,S.width>>lt),gt=Math.max(1,S.height>>lt);J===s.TEXTURE_3D||J===s.TEXTURE_2D_ARRAY?e.texImage3D(J,lt,et,vt,gt,S.depth,0,ht,Q,null):e.texImage2D(J,lt,et,vt,gt,0,ht,Q,null)}e.bindFramebuffer(s.FRAMEBUFFER,R),Kt(S)?o.framebufferTexture2DMultisampleEXT(s.FRAMEBUFFER,q,J,Ut.__webglTexture,0,qt(S)):(J===s.TEXTURE_2D||J>=s.TEXTURE_CUBE_MAP_POSITIVE_X&&J<=s.TEXTURE_CUBE_MAP_NEGATIVE_Z)&&s.framebufferTexture2D(s.FRAMEBUFFER,q,J,Ut.__webglTexture,lt),e.bindFramebuffer(s.FRAMEBUFFER,null)}function Xt(R,S,k){if(s.bindRenderbuffer(s.RENDERBUFFER,R),S.depthBuffer){const q=S.depthTexture,J=q&&q.isDepthTexture?q.type:null,lt=w(S.stencilBuffer,J),ht=S.stencilBuffer?s.DEPTH_STENCIL_ATTACHMENT:s.DEPTH_ATTACHMENT;Kt(S)?o.renderbufferStorageMultisampleEXT(s.RENDERBUFFER,qt(S),lt,S.width,S.height):k?s.renderbufferStorageMultisample(s.RENDERBUFFER,qt(S),lt,S.width,S.height):s.renderbufferStorage(s.RENDERBUFFER,lt,S.width,S.height),s.framebufferRenderbuffer(s.FRAMEBUFFER,ht,s.RENDERBUFFER,R)}else{const q=S.textures;for(let J=0;J<q.length;J++){const lt=q[J],ht=r.convert(lt.format,lt.colorSpace),Q=r.convert(lt.type),et=y(lt.internalFormat,ht,Q,lt.normalized,lt.colorSpace);Kt(S)?o.renderbufferStorageMultisampleEXT(s.RENDERBUFFER,qt(S),et,S.width,S.height):k?s.renderbufferStorageMultisample(s.RENDERBUFFER,qt(S),et,S.width,S.height):s.renderbufferStorage(s.RENDERBUFFER,et,S.width,S.height)}}s.bindRenderbuffer(s.RENDERBUFFER,null)}function ge(R,S,k){const q=S.isWebGLCubeRenderTarget===!0;if(e.bindFramebuffer(s.FRAMEBUFFER,R),!(S.depthTexture&&S.depthTexture.isDepthTexture))throw new Error("THREE.WebGLTextures: renderTarget.depthTexture must be an instance of THREE.DepthTexture.");const J=n.get(S.depthTexture);if(J.__renderTarget=S,(!J.__webglTexture||S.depthTexture.image.width!==S.width||S.depthTexture.image.height!==S.height)&&(S.depthTexture.image.width=S.width,S.depthTexture.image.height=S.height,S.depthTexture.needsUpdate=!0),q){if(J.__webglInit===void 0&&(J.__webglInit=!0,S.depthTexture.addEventListener("dispose",E)),J.__webglTexture===void 0){J.__webglTexture=s.createTexture(),e.bindTexture(s.TEXTURE_CUBE_MAP,J.__webglTexture),Wt(s.TEXTURE_CUBE_MAP,S.depthTexture);const mt=r.convert(S.depthTexture.format),Ut=r.convert(S.depthTexture.type);let vt;S.depthTexture.format===ci?vt=s.DEPTH_COMPONENT24:S.depthTexture.format===Xi&&(vt=s.DEPTH24_STENCIL8);for(let gt=0;gt<6;gt++)s.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+gt,0,vt,S.width,S.height,0,mt,Ut,null)}}else G(S.depthTexture,0);const lt=J.__webglTexture,ht=qt(S),Q=q?s.TEXTURE_CUBE_MAP_POSITIVE_X+k:s.TEXTURE_2D,et=S.depthTexture.format===Xi?s.DEPTH_STENCIL_ATTACHMENT:s.DEPTH_ATTACHMENT;if(S.depthTexture.format===ci)Kt(S)?o.framebufferTexture2DMultisampleEXT(s.FRAMEBUFFER,et,Q,lt,0,ht):s.framebufferTexture2D(s.FRAMEBUFFER,et,Q,lt,0);else if(S.depthTexture.format===Xi)Kt(S)?o.framebufferTexture2DMultisampleEXT(s.FRAMEBUFFER,et,Q,lt,0,ht):s.framebufferTexture2D(s.FRAMEBUFFER,et,Q,lt,0);else throw new Error("THREE.WebGLTextures: Unknown depthTexture format.")}function nt(R){const S=n.get(R),k=R.isWebGLCubeRenderTarget===!0;if(S.__boundDepthTexture!==R.depthTexture){const q=R.depthTexture;if(S.__depthDisposeCallback&&S.__depthDisposeCallback(),q){const J=()=>{delete S.__boundDepthTexture,delete S.__depthDisposeCallback,q.removeEventListener("dispose",J)};q.addEventListener("dispose",J),S.__depthDisposeCallback=J}S.__boundDepthTexture=q}if(R.depthTexture&&!S.__autoAllocateDepthBuffer)if(k)for(let q=0;q<6;q++)ge(S.__webglFramebuffer[q],R,q);else{const q=R.texture.mipmaps;q&&q.length>0?ge(S.__webglFramebuffer[0],R,0):ge(S.__webglFramebuffer,R,0)}else if(k){S.__webglDepthbuffer=[];for(let q=0;q<6;q++)if(e.bindFramebuffer(s.FRAMEBUFFER,S.__webglFramebuffer[q]),S.__webglDepthbuffer[q]===void 0)S.__webglDepthbuffer[q]=s.createRenderbuffer(),Xt(S.__webglDepthbuffer[q],R,!1);else{const J=R.stencilBuffer?s.DEPTH_STENCIL_ATTACHMENT:s.DEPTH_ATTACHMENT,lt=S.__webglDepthbuffer[q];s.bindRenderbuffer(s.RENDERBUFFER,lt),s.framebufferRenderbuffer(s.FRAMEBUFFER,J,s.RENDERBUFFER,lt)}}else{const q=R.texture.mipmaps;if(q&&q.length>0?e.bindFramebuffer(s.FRAMEBUFFER,S.__webglFramebuffer[0]):e.bindFramebuffer(s.FRAMEBUFFER,S.__webglFramebuffer),S.__webglDepthbuffer===void 0)S.__webglDepthbuffer=s.createRenderbuffer(),Xt(S.__webglDepthbuffer,R,!1);else{const J=R.stencilBuffer?s.DEPTH_STENCIL_ATTACHMENT:s.DEPTH_ATTACHMENT,lt=S.__webglDepthbuffer;s.bindRenderbuffer(s.RENDERBUFFER,lt),s.framebufferRenderbuffer(s.FRAMEBUFFER,J,s.RENDERBUFFER,lt)}}e.bindFramebuffer(s.FRAMEBUFFER,null)}function rt(R,S,k){const q=n.get(R);S!==void 0&&Tt(q.__webglFramebuffer,R,R.texture,s.COLOR_ATTACHMENT0,s.TEXTURE_2D,0),k!==void 0&&nt(R)}function at(R){const S=R.texture,k=n.get(R),q=n.get(S);R.addEventListener("dispose",v);const J=R.textures,lt=R.isWebGLCubeRenderTarget===!0,ht=J.length>1;if(ht||(q.__webglTexture===void 0&&(q.__webglTexture=s.createTexture()),q.__version=S.version,a.memory.textures++),lt){k.__webglFramebuffer=[];for(let Q=0;Q<6;Q++)if(S.mipmaps&&S.mipmaps.length>0){k.__webglFramebuffer[Q]=[];for(let et=0;et<S.mipmaps.length;et++)k.__webglFramebuffer[Q][et]=s.createFramebuffer()}else k.__webglFramebuffer[Q]=s.createFramebuffer()}else{if(S.mipmaps&&S.mipmaps.length>0){k.__webglFramebuffer=[];for(let Q=0;Q<S.mipmaps.length;Q++)k.__webglFramebuffer[Q]=s.createFramebuffer()}else k.__webglFramebuffer=s.createFramebuffer();if(ht)for(let Q=0,et=J.length;Q<et;Q++){const mt=n.get(J[Q]);mt.__webglTexture===void 0&&(mt.__webglTexture=s.createTexture(),a.memory.textures++)}if(R.samples>0&&Kt(R)===!1){k.__webglMultisampledFramebuffer=s.createFramebuffer(),k.__webglColorRenderbuffer=[],e.bindFramebuffer(s.FRAMEBUFFER,k.__webglMultisampledFramebuffer);for(let Q=0;Q<J.length;Q++){const et=J[Q];k.__webglColorRenderbuffer[Q]=s.createRenderbuffer(),s.bindRenderbuffer(s.RENDERBUFFER,k.__webglColorRenderbuffer[Q]);const mt=r.convert(et.format,et.colorSpace),Ut=r.convert(et.type),vt=y(et.internalFormat,mt,Ut,et.normalized,et.colorSpace,R.isXRRenderTarget===!0),gt=qt(R);s.renderbufferStorageMultisample(s.RENDERBUFFER,gt,vt,R.width,R.height),s.framebufferRenderbuffer(s.FRAMEBUFFER,s.COLOR_ATTACHMENT0+Q,s.RENDERBUFFER,k.__webglColorRenderbuffer[Q])}s.bindRenderbuffer(s.RENDERBUFFER,null),R.depthBuffer&&(k.__webglDepthRenderbuffer=s.createRenderbuffer(),Xt(k.__webglDepthRenderbuffer,R,!0)),e.bindFramebuffer(s.FRAMEBUFFER,null)}}if(lt){e.bindTexture(s.TEXTURE_CUBE_MAP,q.__webglTexture),Wt(s.TEXTURE_CUBE_MAP,S);for(let Q=0;Q<6;Q++)if(S.mipmaps&&S.mipmaps.length>0)for(let et=0;et<S.mipmaps.length;et++)Tt(k.__webglFramebuffer[Q][et],R,S,s.COLOR_ATTACHMENT0,s.TEXTURE_CUBE_MAP_POSITIVE_X+Q,et);else Tt(k.__webglFramebuffer[Q],R,S,s.COLOR_ATTACHMENT0,s.TEXTURE_CUBE_MAP_POSITIVE_X+Q,0);m(S)&&x(s.TEXTURE_CUBE_MAP),e.unbindTexture()}else if(ht){for(let Q=0,et=J.length;Q<et;Q++){const mt=J[Q],Ut=n.get(mt);let vt=s.TEXTURE_2D;(R.isWebGL3DRenderTarget||R.isWebGLArrayRenderTarget)&&(vt=R.isWebGL3DRenderTarget?s.TEXTURE_3D:s.TEXTURE_2D_ARRAY),e.bindTexture(vt,Ut.__webglTexture),Wt(vt,mt),Tt(k.__webglFramebuffer,R,mt,s.COLOR_ATTACHMENT0+Q,vt,0),m(mt)&&x(vt)}e.unbindTexture()}else{let Q=s.TEXTURE_2D;if((R.isWebGL3DRenderTarget||R.isWebGLArrayRenderTarget)&&(Q=R.isWebGL3DRenderTarget?s.TEXTURE_3D:s.TEXTURE_2D_ARRAY),e.bindTexture(Q,q.__webglTexture),Wt(Q,S),S.mipmaps&&S.mipmaps.length>0)for(let et=0;et<S.mipmaps.length;et++)Tt(k.__webglFramebuffer[et],R,S,s.COLOR_ATTACHMENT0,Q,et);else Tt(k.__webglFramebuffer,R,S,s.COLOR_ATTACHMENT0,Q,0);m(S)&&x(Q),e.unbindTexture()}R.depthBuffer&&nt(R)}function ot(R){const S=R.textures;for(let k=0,q=S.length;k<q;k++){const J=S[k];if(m(J)){const lt=M(R),ht=n.get(J).__webglTexture;e.bindTexture(lt,ht),x(lt),e.unbindTexture()}}}const dt=[],Vt=[];function Bt(R){if(R.samples>0){if(Kt(R)===!1){const S=R.textures,k=R.width,q=R.height;let J=s.COLOR_BUFFER_BIT;const lt=R.stencilBuffer?s.DEPTH_STENCIL_ATTACHMENT:s.DEPTH_ATTACHMENT,ht=n.get(R),Q=S.length>1;if(Q)for(let mt=0;mt<S.length;mt++)e.bindFramebuffer(s.FRAMEBUFFER,ht.__webglMultisampledFramebuffer),s.framebufferRenderbuffer(s.FRAMEBUFFER,s.COLOR_ATTACHMENT0+mt,s.RENDERBUFFER,null),e.bindFramebuffer(s.FRAMEBUFFER,ht.__webglFramebuffer),s.framebufferTexture2D(s.DRAW_FRAMEBUFFER,s.COLOR_ATTACHMENT0+mt,s.TEXTURE_2D,null,0);e.bindFramebuffer(s.READ_FRAMEBUFFER,ht.__webglMultisampledFramebuffer);const et=R.texture.mipmaps;et&&et.length>0?e.bindFramebuffer(s.DRAW_FRAMEBUFFER,ht.__webglFramebuffer[0]):e.bindFramebuffer(s.DRAW_FRAMEBUFFER,ht.__webglFramebuffer);for(let mt=0;mt<S.length;mt++){if(R.resolveDepthBuffer&&(R.depthBuffer&&(J|=s.DEPTH_BUFFER_BIT),R.stencilBuffer&&R.resolveStencilBuffer&&(J|=s.STENCIL_BUFFER_BIT)),Q){s.framebufferRenderbuffer(s.READ_FRAMEBUFFER,s.COLOR_ATTACHMENT0,s.RENDERBUFFER,ht.__webglColorRenderbuffer[mt]);const Ut=n.get(S[mt]).__webglTexture;s.framebufferTexture2D(s.DRAW_FRAMEBUFFER,s.COLOR_ATTACHMENT0,s.TEXTURE_2D,Ut,0)}s.blitFramebuffer(0,0,k,q,0,0,k,q,J,s.NEAREST),l===!0&&(dt.length=0,Vt.length=0,dt.push(s.COLOR_ATTACHMENT0+mt),R.depthBuffer&&R.storeMultisampledDepthBuffer===!1&&(dt.push(lt),Vt.push(lt),s.invalidateFramebuffer(s.DRAW_FRAMEBUFFER,Vt)),s.invalidateFramebuffer(s.READ_FRAMEBUFFER,dt))}if(e.bindFramebuffer(s.READ_FRAMEBUFFER,null),e.bindFramebuffer(s.DRAW_FRAMEBUFFER,null),Q)for(let mt=0;mt<S.length;mt++){e.bindFramebuffer(s.FRAMEBUFFER,ht.__webglMultisampledFramebuffer),s.framebufferRenderbuffer(s.FRAMEBUFFER,s.COLOR_ATTACHMENT0+mt,s.RENDERBUFFER,ht.__webglColorRenderbuffer[mt]);const Ut=n.get(S[mt]).__webglTexture;e.bindFramebuffer(s.FRAMEBUFFER,ht.__webglFramebuffer),s.framebufferTexture2D(s.DRAW_FRAMEBUFFER,s.COLOR_ATTACHMENT0+mt,s.TEXTURE_2D,Ut,0)}e.bindFramebuffer(s.DRAW_FRAMEBUFFER,ht.__webglMultisampledFramebuffer)}else if(R.depthBuffer&&R.storeMultisampledDepthBuffer===!1&&l){const S=R.stencilBuffer?s.DEPTH_STENCIL_ATTACHMENT:s.DEPTH_ATTACHMENT;s.invalidateFramebuffer(s.DRAW_FRAMEBUFFER,[S])}}}function qt(R){return Math.min(i.maxSamples,R.samples)}function Kt(R){const S=n.get(R);return R.samples>0&&t.has("WEBGL_multisampled_render_to_texture")===!0&&S.__useRenderToTexture!==!1}function U(R){const S=a.render.frame;h.get(R)!==S&&(h.set(R,S),R.update())}function de(R,S){const k=R.colorSpace,q=R.format,J=R.type;return R.isCompressedTexture===!0||R.isVideoTexture===!0||k!==va&&k!==Si&&(ae.getTransfer(k)===me?(q!==dn||J!==_n)&&pt("WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType."):Nt("WebGLTextures: Unsupported texture color space:",k)),S}function ie(R){return typeof HTMLImageElement<"u"&&R instanceof HTMLImageElement?(c.width=R.naturalWidth||R.width,c.height=R.naturalHeight||R.height):typeof VideoFrame<"u"&&R instanceof VideoFrame?(c.width=R.displayWidth,c.height=R.displayHeight):(c.width=R.width,c.height=R.height),c}this.allocateTextureUnit=V,this.resetTextureUnits=N,this.getTextureUnits=D,this.setTextureUnits=O,this.setTexture2D=G,this.setTexture2DArray=X,this.setTexture3D=$,this.setTextureCube=Z,this.rebindTextures=rt,this.setupRenderTarget=at,this.updateRenderTargetMipmap=ot,this.updateMultisampleRenderTarget=Bt,this.setupDepthRenderbuffer=nt,this.setupFrameBufferTexture=Tt,this.useMultisampledRTT=Kt,this.isReversedDepthBuffer=function(){return e.buffers.depth.getReversed()}}function Nm(s,t){function e(n,i=Si){let r;const a=ae.getTransfer(i);if(n===_n)return s.UNSIGNED_BYTE;if(n===Gl)return s.UNSIGNED_SHORT_4_4_4_4;if(n===Hl)return s.UNSIGNED_SHORT_5_5_5_1;if(n===jh)return s.UNSIGNED_INT_5_9_9_9_REV;if(n===tu)return s.UNSIGNED_INT_10F_11F_11F_REV;if(n===Kh)return s.BYTE;if(n===Qh)return s.SHORT;if(n===pr)return s.UNSIGNED_SHORT;if(n===Vl)return s.INT;if(n===Un)return s.UNSIGNED_INT;if(n===un)return s.FLOAT;if(n===Zn)return s.HALF_FLOAT;if(n===eu)return s.ALPHA;if(n===nu)return s.RGB;if(n===dn)return s.RGBA;if(n===ci)return s.DEPTH_COMPONENT;if(n===Xi)return s.DEPTH_STENCIL;if(n===Wl)return s.RED;if(n===Na)return s.RED_INTEGER;if(n===Ji)return s.RG;if(n===Xl)return s.RG_INTEGER;if(n===ql)return s.RGBA_INTEGER;if(n===ra||n===aa||n===oa||n===la)if(a===me)if(r=t.get("WEBGL_compressed_texture_s3tc_srgb"),r!==null){if(n===ra)return r.COMPRESSED_SRGB_S3TC_DXT1_EXT;if(n===aa)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;if(n===oa)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT;if(n===la)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT}else return null;else if(r=t.get("WEBGL_compressed_texture_s3tc"),r!==null){if(n===ra)return r.COMPRESSED_RGB_S3TC_DXT1_EXT;if(n===aa)return r.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(n===oa)return r.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(n===la)return r.COMPRESSED_RGBA_S3TC_DXT5_EXT}else return null;if(n===Qo||n===jo||n===tl||n===el)if(r=t.get("WEBGL_compressed_texture_pvrtc"),r!==null){if(n===Qo)return r.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(n===jo)return r.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(n===tl)return r.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(n===el)return r.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}else return null;if(n===nl||n===il||n===sl||n===rl||n===al||n===ga||n===ol)if(r=t.get("WEBGL_compressed_texture_etc"),r!==null){if(n===nl||n===il)return a===me?r.COMPRESSED_SRGB8_ETC2:r.COMPRESSED_RGB8_ETC2;if(n===sl)return a===me?r.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC:r.COMPRESSED_RGBA8_ETC2_EAC;if(n===rl)return r.COMPRESSED_R11_EAC;if(n===al)return r.COMPRESSED_SIGNED_R11_EAC;if(n===ga)return r.COMPRESSED_RG11_EAC;if(n===ol)return r.COMPRESSED_SIGNED_RG11_EAC}else return null;if(n===ll||n===cl||n===hl||n===ul||n===dl||n===fl||n===pl||n===ml||n===gl||n===_l||n===xl||n===yl||n===vl||n===Ml)if(r=t.get("WEBGL_compressed_texture_astc"),r!==null){if(n===ll)return a===me?r.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR:r.COMPRESSED_RGBA_ASTC_4x4_KHR;if(n===cl)return a===me?r.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR:r.COMPRESSED_RGBA_ASTC_5x4_KHR;if(n===hl)return a===me?r.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR:r.COMPRESSED_RGBA_ASTC_5x5_KHR;if(n===ul)return a===me?r.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR:r.COMPRESSED_RGBA_ASTC_6x5_KHR;if(n===dl)return a===me?r.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR:r.COMPRESSED_RGBA_ASTC_6x6_KHR;if(n===fl)return a===me?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR:r.COMPRESSED_RGBA_ASTC_8x5_KHR;if(n===pl)return a===me?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR:r.COMPRESSED_RGBA_ASTC_8x6_KHR;if(n===ml)return a===me?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR:r.COMPRESSED_RGBA_ASTC_8x8_KHR;if(n===gl)return a===me?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR:r.COMPRESSED_RGBA_ASTC_10x5_KHR;if(n===_l)return a===me?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR:r.COMPRESSED_RGBA_ASTC_10x6_KHR;if(n===xl)return a===me?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR:r.COMPRESSED_RGBA_ASTC_10x8_KHR;if(n===yl)return a===me?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR:r.COMPRESSED_RGBA_ASTC_10x10_KHR;if(n===vl)return a===me?r.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR:r.COMPRESSED_RGBA_ASTC_12x10_KHR;if(n===Ml)return a===me?r.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR:r.COMPRESSED_RGBA_ASTC_12x12_KHR}else return null;if(n===Sl||n===bl||n===wl)if(r=t.get("EXT_texture_compression_bptc"),r!==null){if(n===Sl)return a===me?r.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT:r.COMPRESSED_RGBA_BPTC_UNORM_EXT;if(n===bl)return r.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT;if(n===wl)return r.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT}else return null;if(n===Al||n===Tl||n===_a||n===El)if(r=t.get("EXT_texture_compression_rgtc"),r!==null){if(n===Al)return r.COMPRESSED_RED_RGTC1_EXT;if(n===Tl)return r.COMPRESSED_SIGNED_RED_RGTC1_EXT;if(n===_a)return r.COMPRESSED_RED_GREEN_RGTC2_EXT;if(n===El)return r.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT}else return null;return n===mr?s.UNSIGNED_INT_24_8:s[n]!==void 0?s[n]:null}return{convert:e}}const i1=`
void main() {

	gl_Position = vec4( position, 1.0 );

}`,s1=`
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

}`;class r1{constructor(){this.texture=null,this.mesh=null,this.depthNear=0,this.depthFar=0}init(t,e){if(this.texture===null){const n=new fu(t.texture);(t.depthNear!==e.depthNear||t.depthFar!==e.depthFar)&&(this.depthNear=t.depthNear,this.depthFar=t.depthFar),this.texture=n}}getMesh(t){if(this.texture!==null&&this.mesh===null){const e=t.cameras[0].viewport,n=new Fn({vertexShader:i1,fragmentShader:s1,uniforms:{depthColor:{value:this.texture},depthWidth:{value:e.z},depthHeight:{value:e.w}}});this.mesh=new be(new Ps(20,20),n)}return this.mesh}reset(){this.texture=null,this.mesh=null}getDepthTexture(){return this.texture}}class a1 extends Jn{constructor(t,e){super();const n=this;let i=null,r=1,a=null,o="local-floor",l=1,c=null,h=null,f=null,u=null,d=null,p=null;const _=typeof XRWebGLBinding<"u",g=new r1,m={},x=e.getContextAttributes();let M=null,y=null;const w=[],b=[],E=new it;let v=null,T=null;const C=new Xe;C.viewport=new xe;const P=new Xe;P.viewport=new xe;const L=[C,P],N=new vm;let D=null,O=null;this.cameraAutoUpdate=!0,this.enabled=!1,this.isPresenting=!1,this.getController=function(K){let tt=w[K];return tt===void 0&&(tt=new Ho,w[K]=tt),tt.getTargetRaySpace()},this.getControllerGrip=function(K){let tt=w[K];return tt===void 0&&(tt=new Ho,w[K]=tt),tt.getGripSpace()},this.getHand=function(K){let tt=w[K];return tt===void 0&&(tt=new Ho,w[K]=tt),tt.getHandSpace()};function V(K){const tt=b.indexOf(K.inputSource);if(tt===-1)return;const ft=w[tt];ft!==void 0&&(ft.update(K.inputSource,K.frame,c||a),ft.dispatchEvent({type:K.type,data:K.inputSource}))}function z(){i.removeEventListener("select",V),i.removeEventListener("selectstart",V),i.removeEventListener("selectend",V),i.removeEventListener("squeeze",V),i.removeEventListener("squeezestart",V),i.removeEventListener("squeezeend",V),i.removeEventListener("end",z),i.removeEventListener("inputsourceschange",G);for(let K=0;K<w.length;K++){const tt=b[K];tt!==null&&(b[K]=null,w[K].disconnect(tt))}D=null,O=null,g.reset();for(const K in m)delete m[K];if(t.setRenderTarget(M),d=null,u=null,f=null,i=null,y=null,Qt.stop(),n.isPresenting=!1,t.setPixelRatio(v),t.setSize(E.width,E.height,!1),T!==null){const K=T.camera;K.fov=T.fov,K.zoom=T.zoom,K.updateProjectionMatrix(),T=null}n.dispatchEvent({type:"sessionend"})}this.setFramebufferScaleFactor=function(K){r=K,n.isPresenting===!0&&pt("WebXRManager: Cannot change framebuffer scale while presenting.")},this.setReferenceSpaceType=function(K){o=K,n.isPresenting===!0&&pt("WebXRManager: Cannot change reference space type while presenting.")},this.getReferenceSpace=function(){return c||a},this.setReferenceSpace=function(K){c=K},this.getBaseLayer=function(){return u!==null?u:d},this.getBinding=function(){return f===null&&_&&(f=new XRWebGLBinding(i,e)),f},this.getFrame=function(){return p},this.getSession=function(){return i},this.setSession=async function(K){if(i=K,i!==null){if(M=t.getRenderTarget(),i.addEventListener("select",V),i.addEventListener("selectstart",V),i.addEventListener("selectend",V),i.addEventListener("squeeze",V),i.addEventListener("squeezestart",V),i.addEventListener("squeezeend",V),i.addEventListener("end",z),i.addEventListener("inputsourceschange",G),x.xrCompatible!==!0&&await e.makeXRCompatible(),v=t.getPixelRatio(),t.getSize(E),_&&"createProjectionLayer"in XRWebGLBinding.prototype){let ft=null,kt=null,Tt=null;x.depth&&(Tt=x.stencil?e.DEPTH24_STENCIL8:e.DEPTH_COMPONENT24,ft=x.stencil?Xi:ci,kt=x.stencil?mr:Un);const Xt={colorFormat:e.RGBA8,depthFormat:Tt,scaleFactor:r};f=this.getBinding(),u=f.createProjectionLayer(Xt),i.updateRenderState({layers:[u]}),t.setPixelRatio(1),t.setSize(u.textureWidth,u.textureHeight,!1),y=new Mn(u.textureWidth,u.textureHeight,{format:dn,type:_n,depthTexture:new xr(u.textureWidth,u.textureHeight,kt,void 0,void 0,void 0,void 0,void 0,void 0,ft),stencilBuffer:x.stencil,colorSpace:t.outputColorSpace,samples:x.antialias?4:0,resolveDepthBuffer:u.ignoreDepthValues===!1,resolveStencilBuffer:u.ignoreDepthValues===!1,storeMultisampledDepthBuffer:u.ignoreDepthValues===!1,storeMultisampledStencilBuffer:u.ignoreDepthValues===!1})}else{const ft={antialias:x.antialias,alpha:!0,depth:x.depth,stencil:x.stencil,framebufferScaleFactor:r};d=new XRWebGLLayer(i,e,ft),i.updateRenderState({baseLayer:d}),t.setPixelRatio(1),t.setSize(d.framebufferWidth,d.framebufferHeight,!1),y=new Mn(d.framebufferWidth,d.framebufferHeight,{format:dn,type:_n,colorSpace:t.outputColorSpace,stencilBuffer:x.stencil,resolveDepthBuffer:d.ignoreDepthValues===!1,resolveStencilBuffer:d.ignoreDepthValues===!1,storeMultisampledDepthBuffer:d.ignoreDepthValues===!1,storeMultisampledStencilBuffer:d.ignoreDepthValues===!1})}y.isXRRenderTarget=!0,this.setFoveation(l),c=null,a=await i.requestReferenceSpace(o),Qt.setContext(i),Qt.start(),n.isPresenting=!0,n.dispatchEvent({type:"sessionstart"})}},this.getEnvironmentBlendMode=function(){if(i!==null)return i.environmentBlendMode},this.getDepthTexture=function(){return g.getDepthTexture()};function G(K){for(let tt=0;tt<K.removed.length;tt++){const ft=K.removed[tt],kt=b.indexOf(ft);kt>=0&&(b[kt]=null,w[kt].disconnect(ft))}for(let tt=0;tt<K.added.length;tt++){const ft=K.added[tt];let kt=b.indexOf(ft);if(kt===-1){for(let Xt=0;Xt<w.length;Xt++)if(Xt>=b.length){b.push(ft),kt=Xt;break}else if(b[Xt]===null){b[Xt]=ft,kt=Xt;break}if(kt===-1)break}const Tt=w[kt];Tt&&Tt.connect(ft)}}const X=new I,$=new I;function Z(K,tt,ft){X.setFromMatrixPosition(tt.matrixWorld),$.setFromMatrixPosition(ft.matrixWorld);const kt=X.distanceTo($),Tt=tt.projectionMatrix.elements,Xt=ft.projectionMatrix.elements,ge=Tt[14]/(Tt[10]-1),nt=Tt[14]/(Tt[10]+1),rt=(Tt[9]+1)/Tt[5],at=(Tt[9]-1)/Tt[5],ot=(Tt[8]-1)/Tt[0],dt=(Xt[8]+1)/Xt[0],Vt=ge*ot,Bt=ge*dt,qt=kt/(-ot+dt),Kt=qt*-ot;if(tt.matrixWorld.decompose(K.position,K.quaternion,K.scale),K.translateX(Kt),K.translateZ(qt),K.matrixWorld.compose(K.position,K.quaternion,K.scale),K.matrixWorldInverse.copy(K.matrixWorld).invert(),Tt[10]===-1)K.projectionMatrix.copy(tt.projectionMatrix),K.projectionMatrixInverse.copy(tt.projectionMatrixInverse);else{const U=ge+qt,de=nt+qt,ie=Vt-Kt,R=Bt+(kt-Kt),S=rt*nt/de*U,k=at*nt/de*U;K.projectionMatrix.makePerspective(ie,R,S,k,U,de),K.projectionMatrixInverse.copy(K.projectionMatrix).invert()}}function ct(K,tt){tt===null?K.matrixWorld.copy(K.matrix):K.matrixWorld.multiplyMatrices(tt.matrixWorld,K.matrix),K.matrixWorldInverse.copy(K.matrixWorld).invert()}this.updateCamera=function(K){if(i===null)return;let tt=K.near,ft=K.far;g.texture!==null&&(g.depthNear>0&&(tt=g.depthNear),g.depthFar>0&&(ft=g.depthFar)),N.near=P.near=C.near=tt,N.far=P.far=C.far=ft,(D!==N.near||O!==N.far)&&(i.updateRenderState({depthNear:N.near,depthFar:N.far}),D=N.near,O=N.far),N.layers.mask=K.layers.mask|6,C.layers.mask=N.layers.mask&-5,P.layers.mask=N.layers.mask&-3;const kt=K.parent,Tt=N.cameras;ct(N,kt);for(let Xt=0;Xt<Tt.length;Xt++)ct(Tt[Xt],kt);Tt.length===2?Z(N,C,P):N.projectionMatrix.copy(C.projectionMatrix),T===null&&K.isPerspectiveCamera&&(T={camera:K,fov:K.fov,zoom:K.zoom}),bt(K,N,kt)};function bt(K,tt,ft){ft===null?K.matrix.copy(tt.matrixWorld):(K.matrix.copy(ft.matrixWorld),K.matrix.invert(),K.matrix.multiply(tt.matrixWorld)),K.matrix.decompose(K.position,K.quaternion,K.scale),K.updateMatrixWorld(!0),K.projectionMatrix.copy(tt.projectionMatrix),K.projectionMatrixInverse.copy(tt.projectionMatrixInverse),K.isPerspectiveCamera&&(K.fov=gr*2*Math.atan(1/K.projectionMatrix.elements[5]),K.zoom=1)}this.getCamera=function(){return N},this.getFoveation=function(){if(!(u===null&&d===null))return l},this.setFoveation=function(K){l=K,u!==null&&(u.fixedFoveation=K),d!==null&&d.fixedFoveation!==void 0&&(d.fixedFoveation=K)},this.hasDepthSensing=function(){return g.texture!==null},this.getDepthSensingMesh=function(){return g.getMesh(N)},this.getCameraTexture=function(K){return m[K]};let $t=null;function Wt(K,tt){if(h=tt.getViewerPose(c||a),p=tt,h!==null){const ft=h.views;d!==null&&(t.setRenderTargetFramebuffer(y,d.framebuffer),t.setRenderTarget(y));let kt=!1;ft.length!==N.cameras.length&&(N.cameras.length=0,kt=!0);for(let nt=0;nt<ft.length;nt++){const rt=ft[nt];let at=null;if(d!==null)at=d.getViewport(rt);else{const dt=f.getViewSubImage(u,rt);at=dt.viewport,nt===0&&(t.setRenderTargetTextures(y,dt.colorTexture,dt.depthStencilTexture),t.setRenderTarget(y))}let ot=L[nt];ot===void 0&&(ot=new Xe,ot.layers.enable(nt),ot.viewport=new xe,L[nt]=ot),ot.matrix.fromArray(rt.transform.matrix),ot.matrix.decompose(ot.position,ot.quaternion,ot.scale),ot.projectionMatrix.fromArray(rt.projectionMatrix),ot.projectionMatrixInverse.copy(ot.projectionMatrix).invert(),ot.viewport.set(at.x,at.y,at.width,at.height),nt===0&&(N.matrix.copy(ot.matrix),N.matrix.decompose(N.position,N.quaternion,N.scale)),kt===!0&&N.cameras.push(ot)}const Tt=i.enabledFeatures;if(Tt&&Tt.includes("depth-sensing")&&i.depthUsage=="gpu-optimized"&&_){f=n.getBinding();const nt=f.getDepthInformation(ft[0]);nt&&nt.isValid&&nt.texture&&g.init(nt,i.renderState)}if(Tt&&Tt.includes("camera-access")&&_){t.state.unbindTexture(),f=n.getBinding();for(let nt=0;nt<ft.length;nt++){const rt=ft[nt].camera;if(rt){let at=m[rt];at||(at=new fu,m[rt]=at);const ot=f.getCameraImage(rt);at.sourceTexture=ot}}}}for(let ft=0;ft<w.length;ft++){const kt=b[ft],Tt=w[ft];kt!==null&&Tt!==void 0&&Tt.update(kt,tt,c||a)}$t&&$t(K,tt),tt.detectedPlanes&&n.dispatchEvent({type:"planesdetected",data:tt}),p=null}const Qt=new Cm;Qt.setAnimationLoop(Wt),this.setAnimationLoop=function(K){$t=K},this.dispose=function(){}}}const o1=new Yt,Um=new Jt;Um.set(-1,0,0,0,1,0,0,0,1);function l1(s,t){function e(g,m){g.matrixAutoUpdate===!0&&g.updateMatrix(),m.value.copy(g.matrix)}function n(g,m){m.color.getRGB(g.fogColor.value,Jp(s)),m.isFog?(g.fogNear.value=m.near,g.fogFar.value=m.far):m.isFogExp2&&(g.fogDensity.value=m.density)}function i(g,m,x,M,y){m.isNodeMaterial?m.uniformsNeedUpdate=!1:m.isMeshBasicMaterial?r(g,m):m.isMeshLambertMaterial?(r(g,m),m.envMap&&(g.envMapIntensity.value=m.envMapIntensity)):m.isMeshToonMaterial?(r(g,m),f(g,m)):m.isMeshPhongMaterial?(r(g,m),h(g,m),m.envMap&&(g.envMapIntensity.value=m.envMapIntensity)):m.isMeshStandardMaterial?(r(g,m),u(g,m),m.isMeshPhysicalMaterial&&d(g,m,y)):m.isMeshMatcapMaterial?(r(g,m),p(g,m)):m.isMeshDepthMaterial?r(g,m):m.isMeshDistanceMaterial?(r(g,m),_(g,m)):m.isMeshNormalMaterial?r(g,m):m.isLineBasicMaterial?(a(g,m),m.isLineDashedMaterial&&o(g,m)):m.isPointsMaterial?l(g,m,x,M):m.isSpriteMaterial?c(g,m):m.isShadowMaterial?(g.color.value.copy(m.color),g.opacity.value=m.opacity):m.isShaderMaterial&&(m.uniformsNeedUpdate=!1)}function r(g,m){g.opacity.value=m.opacity,m.color&&g.diffuse.value.copy(m.color),m.emissive&&g.emissive.value.copy(m.emissive).multiplyScalar(m.emissiveIntensity),m.map&&(g.map.value=m.map,e(m.map,g.mapTransform)),m.alphaMap&&(g.alphaMap.value=m.alphaMap,e(m.alphaMap,g.alphaMapTransform)),m.bumpMap&&(g.bumpMap.value=m.bumpMap,e(m.bumpMap,g.bumpMapTransform),g.bumpScale.value=m.bumpScale,m.side===nn&&(g.bumpScale.value*=-1)),m.normalMap&&(g.normalMap.value=m.normalMap,e(m.normalMap,g.normalMapTransform),g.normalScale.value.copy(m.normalScale),m.side===nn&&g.normalScale.value.negate()),m.displacementMap&&(g.displacementMap.value=m.displacementMap,e(m.displacementMap,g.displacementMapTransform),g.displacementScale.value=m.displacementScale,g.displacementBias.value=m.displacementBias),m.emissiveMap&&(g.emissiveMap.value=m.emissiveMap,e(m.emissiveMap,g.emissiveMapTransform)),m.specularMap&&(g.specularMap.value=m.specularMap,e(m.specularMap,g.specularMapTransform)),m.alphaTest>0&&(g.alphaTest.value=m.alphaTest);const x=t.get(m),M=x.envMap,y=x.envMapRotation;M&&(g.envMap.value=M,g.envMapRotation.value.setFromMatrix4(o1.makeRotationFromEuler(y)).transpose(),M.isCubeTexture&&M.isRenderTargetTexture===!1&&g.envMapRotation.value.premultiply(Um),g.reflectivity.value=m.reflectivity,g.ior.value=m.ior,g.refractionRatio.value=m.refractionRatio),m.lightMap&&(g.lightMap.value=m.lightMap,g.lightMapIntensity.value=m.lightMapIntensity,e(m.lightMap,g.lightMapTransform)),m.aoMap&&(g.aoMap.value=m.aoMap,g.aoMapIntensity.value=m.aoMapIntensity,e(m.aoMap,g.aoMapTransform))}function a(g,m){g.diffuse.value.copy(m.color),g.opacity.value=m.opacity,m.map&&(g.map.value=m.map,e(m.map,g.mapTransform))}function o(g,m){g.dashSize.value=m.dashSize,g.totalSize.value=m.dashSize+m.gapSize,g.scale.value=m.scale}function l(g,m,x,M){g.diffuse.value.copy(m.color),g.opacity.value=m.opacity,g.size.value=m.size*x,g.scale.value=M*.5,m.map&&(g.map.value=m.map,e(m.map,g.uvTransform)),m.alphaMap&&(g.alphaMap.value=m.alphaMap,e(m.alphaMap,g.alphaMapTransform)),m.alphaTest>0&&(g.alphaTest.value=m.alphaTest)}function c(g,m){g.diffuse.value.copy(m.color),g.opacity.value=m.opacity,g.rotation.value=m.rotation,m.map&&(g.map.value=m.map,e(m.map,g.mapTransform)),m.alphaMap&&(g.alphaMap.value=m.alphaMap,e(m.alphaMap,g.alphaMapTransform)),m.alphaTest>0&&(g.alphaTest.value=m.alphaTest)}function h(g,m){g.specular.value.copy(m.specular),g.shininess.value=Math.max(m.shininess,1e-4)}function f(g,m){m.gradientMap&&(g.gradientMap.value=m.gradientMap)}function u(g,m){g.metalness.value=m.metalness,m.metalnessMap&&(g.metalnessMap.value=m.metalnessMap,e(m.metalnessMap,g.metalnessMapTransform)),g.roughness.value=m.roughness,m.roughnessMap&&(g.roughnessMap.value=m.roughnessMap,e(m.roughnessMap,g.roughnessMapTransform)),m.envMap&&(g.envMapIntensity.value=m.envMapIntensity)}function d(g,m,x){g.ior.value=m.ior,m.sheen>0&&(g.sheenColor.value.copy(m.sheenColor).multiplyScalar(m.sheen),g.sheenRoughness.value=m.sheenRoughness,m.sheenColorMap&&(g.sheenColorMap.value=m.sheenColorMap,e(m.sheenColorMap,g.sheenColorMapTransform)),m.sheenRoughnessMap&&(g.sheenRoughnessMap.value=m.sheenRoughnessMap,e(m.sheenRoughnessMap,g.sheenRoughnessMapTransform))),m.clearcoat>0&&(g.clearcoat.value=m.clearcoat,g.clearcoatRoughness.value=m.clearcoatRoughness,m.clearcoatMap&&(g.clearcoatMap.value=m.clearcoatMap,e(m.clearcoatMap,g.clearcoatMapTransform)),m.clearcoatRoughnessMap&&(g.clearcoatRoughnessMap.value=m.clearcoatRoughnessMap,e(m.clearcoatRoughnessMap,g.clearcoatRoughnessMapTransform)),m.clearcoatNormalMap&&(g.clearcoatNormalMap.value=m.clearcoatNormalMap,e(m.clearcoatNormalMap,g.clearcoatNormalMapTransform),g.clearcoatNormalScale.value.copy(m.clearcoatNormalScale),m.side===nn&&g.clearcoatNormalScale.value.negate())),m.dispersion>0&&(g.dispersion.value=m.dispersion),m.retroreflectivity>0&&(g.retroreflectivity.value=m.retroreflectivity),m.iridescence>0&&(g.iridescence.value=m.iridescence,g.iridescenceIOR.value=m.iridescenceIOR,g.iridescenceThicknessMinimum.value=m.iridescenceThicknessRange[0],g.iridescenceThicknessMaximum.value=m.iridescenceThicknessRange[1],m.iridescenceMap&&(g.iridescenceMap.value=m.iridescenceMap,e(m.iridescenceMap,g.iridescenceMapTransform)),m.iridescenceThicknessMap&&(g.iridescenceThicknessMap.value=m.iridescenceThicknessMap,e(m.iridescenceThicknessMap,g.iridescenceThicknessMapTransform))),m.transmission>0&&(g.transmission.value=m.transmission,g.transmissionSamplerMap.value=x.texture,g.transmissionSamplerSize.value.set(x.width,x.height),m.transmissionMap&&(g.transmissionMap.value=m.transmissionMap,e(m.transmissionMap,g.transmissionMapTransform)),g.thickness.value=m.thickness,m.thicknessMap&&(g.thicknessMap.value=m.thicknessMap,e(m.thicknessMap,g.thicknessMapTransform)),g.attenuationDistance.value=m.attenuationDistance,g.attenuationColor.value.copy(m.attenuationColor)),m.anisotropy>0&&(g.anisotropyVector.value.set(m.anisotropy*Math.cos(m.anisotropyRotation),m.anisotropy*Math.sin(m.anisotropyRotation)),m.anisotropyMap&&(g.anisotropyMap.value=m.anisotropyMap,e(m.anisotropyMap,g.anisotropyMapTransform))),g.specularIntensity.value=m.specularIntensity,g.specularColor.value.copy(m.specularColor),m.specularColorMap&&(g.specularColorMap.value=m.specularColorMap,e(m.specularColorMap,g.specularColorMapTransform)),m.specularIntensityMap&&(g.specularIntensityMap.value=m.specularIntensityMap,e(m.specularIntensityMap,g.specularIntensityMapTransform))}function p(g,m){m.matcap&&(g.matcap.value=m.matcap)}function _(g,m){const x=t.get(m).light;g.referencePosition.value.setFromMatrixPosition(x.matrixWorld),g.nearDistance.value=x.shadow.camera.near,g.farDistance.value=x.shadow.camera.far}return{refreshFogUniforms:n,refreshMaterialUniforms:i}}function c1(s,t,e,n){let i={},r={},a=[];const o=s.getParameter(s.MAX_UNIFORM_BUFFER_BINDINGS);function l(y,w){const b=w.program;n.uniformBlockBinding(y,b)}function c(y,w){let b=i[y.id];b===void 0&&(g(y),b=h(y),i[y.id]=b,y.addEventListener("dispose",x));const E=w.program;n.updateUBOMapping(y,E);const v=t.render.frame;r[y.id]!==v&&(u(y),r[y.id]=v)}function h(y){const w=f();y.__bindingPointIndex=w;const b=s.createBuffer(),E=y.__size,v=y.usage;return s.bindBuffer(s.UNIFORM_BUFFER,b),s.bufferData(s.UNIFORM_BUFFER,E,v),s.bindBuffer(s.UNIFORM_BUFFER,null),s.bindBufferBase(s.UNIFORM_BUFFER,w,b),b}function f(){for(let y=0;y<o;y++)if(a.indexOf(y)===-1)return a.push(y),y;return Nt("WebGLRenderer: Maximum number of simultaneously usable uniforms groups reached."),0}function u(y){const w=i[y.id],b=y.uniforms,E=y.__cache;s.bindBuffer(s.UNIFORM_BUFFER,w);for(let v=0,T=b.length;v<T;v++){const C=b[v];if(Array.isArray(C))for(let P=0,L=C.length;P<L;P++)d(C[P],v,P,E);else d(C,v,0,E)}s.bindBuffer(s.UNIFORM_BUFFER,null)}function d(y,w,b,E){if(_(y,w,b,E)===!0){const v=y.__offset,T=y.value;if(Array.isArray(T)){let C=0;for(let P=0;P<T.length;P++){const L=T[P],N=m(L);p(L,y.__data,C),typeof L!="number"&&typeof L!="boolean"&&!L.isMatrix3&&!ArrayBuffer.isView(L)&&(C+=N.storage/Float32Array.BYTES_PER_ELEMENT)}}else p(T,y.__data,0);s.bufferSubData(s.UNIFORM_BUFFER,v,y.__data)}}function p(y,w,b){typeof y=="number"||typeof y=="boolean"?w[0]=y:y.isMatrix3?(w[0]=y.elements[0],w[1]=y.elements[1],w[2]=y.elements[2],w[3]=0,w[4]=y.elements[3],w[5]=y.elements[4],w[6]=y.elements[5],w[7]=0,w[8]=y.elements[6],w[9]=y.elements[7],w[10]=y.elements[8],w[11]=0):ArrayBuffer.isView(y)?w.set(new y.constructor(y.buffer,y.byteOffset,w.length)):y.toArray(w,b)}function _(y,w,b,E){const v=y.value,T=w+"_"+b;if(E[T]===void 0)return typeof v=="number"||typeof v=="boolean"?E[T]=v:ArrayBuffer.isView(v)?E[T]=v.slice():E[T]=v.clone(),!0;{const C=E[T];if(typeof v=="number"||typeof v=="boolean"){if(C!==v)return E[T]=v,!0}else{if(ArrayBuffer.isView(v))return!0;if(C.equals(v)===!1)return C.copy(v),!0}}return!1}function g(y){const w=y.uniforms;let b=0;const E=16;for(let T=0,C=w.length;T<C;T++){const P=Array.isArray(w[T])?w[T]:[w[T]];for(let L=0,N=P.length;L<N;L++){const D=P[L],O=Array.isArray(D.value)?D.value:[D.value];for(let V=0,z=O.length;V<z;V++){const G=O[V],X=m(G),$=b%E,Z=$%X.boundary,ct=$+Z;b+=Z,ct!==0&&E-ct<X.storage&&(b+=E-ct),D.__data=new Float32Array(X.storage/Float32Array.BYTES_PER_ELEMENT),D.__offset=b,b+=X.storage}}}const v=b%E;return v>0&&(b+=E-v),y.__size=b,y.__cache={},this}function m(y){const w={boundary:0,storage:0};return typeof y=="number"||typeof y=="boolean"?(w.boundary=4,w.storage=4):y.isVector2?(w.boundary=8,w.storage=8):y.isVector3||y.isColor?(w.boundary=16,w.storage=12):y.isVector4?(w.boundary=16,w.storage=16):y.isMatrix3?(w.boundary=48,w.storage=48):y.isMatrix4?(w.boundary=64,w.storage=64):y.isTexture?pt("WebGLRenderer: Texture samplers can not be part of an uniforms group."):ArrayBuffer.isView(y)?(w.boundary=16,w.storage=y.byteLength):pt("WebGLRenderer: Unsupported uniform value type.",y),w}function x(y){const w=y.target;w.removeEventListener("dispose",x);const b=a.indexOf(w.__bindingPointIndex);a.splice(b,1),s.deleteBuffer(i[w.id]),delete i[w.id],delete r[w.id]}function M(){for(const y in i)s.deleteBuffer(i[y]);a=[],i={},r={}}return{bind:l,update:c,dispose:M}}const h1=new Uint16Array([12469,15057,12620,14925,13266,14620,13807,14376,14323,13990,14545,13625,14713,13328,14840,12882,14931,12528,14996,12233,15039,11829,15066,11525,15080,11295,15085,10976,15082,10705,15073,10495,13880,14564,13898,14542,13977,14430,14158,14124,14393,13732,14556,13410,14702,12996,14814,12596,14891,12291,14937,11834,14957,11489,14958,11194,14943,10803,14921,10506,14893,10278,14858,9960,14484,14039,14487,14025,14499,13941,14524,13740,14574,13468,14654,13106,14743,12678,14818,12344,14867,11893,14889,11509,14893,11180,14881,10751,14852,10428,14812,10128,14765,9754,14712,9466,14764,13480,14764,13475,14766,13440,14766,13347,14769,13070,14786,12713,14816,12387,14844,11957,14860,11549,14868,11215,14855,10751,14825,10403,14782,10044,14729,9651,14666,9352,14599,9029,14967,12835,14966,12831,14963,12804,14954,12723,14936,12564,14917,12347,14900,11958,14886,11569,14878,11247,14859,10765,14828,10401,14784,10011,14727,9600,14660,9289,14586,8893,14508,8533,15111,12234,15110,12234,15104,12216,15092,12156,15067,12010,15028,11776,14981,11500,14942,11205,14902,10752,14861,10393,14812,9991,14752,9570,14682,9252,14603,8808,14519,8445,14431,8145,15209,11449,15208,11451,15202,11451,15190,11438,15163,11384,15117,11274,15055,10979,14994,10648,14932,10343,14871,9936,14803,9532,14729,9218,14645,8742,14556,8381,14461,8020,14365,7603,15273,10603,15272,10607,15267,10619,15256,10631,15231,10614,15182,10535,15118,10389,15042,10167,14963,9787,14883,9447,14800,9115,14710,8665,14615,8318,14514,7911,14411,7507,14279,7198,15314,9675,15313,9683,15309,9712,15298,9759,15277,9797,15229,9773,15166,9668,15084,9487,14995,9274,14898,8910,14800,8539,14697,8234,14590,7790,14479,7409,14367,7067,14178,6621,15337,8619,15337,8631,15333,8677,15325,8769,15305,8871,15264,8940,15202,8909,15119,8775,15022,8565,14916,8328,14804,8009,14688,7614,14569,7287,14448,6888,14321,6483,14088,6171,15350,7402,15350,7419,15347,7480,15340,7613,15322,7804,15287,7973,15229,8057,15148,8012,15046,7846,14933,7611,14810,7357,14682,7069,14552,6656,14421,6316,14251,5948,14007,5528,15356,5942,15356,5977,15353,6119,15348,6294,15332,6551,15302,6824,15249,7044,15171,7122,15070,7050,14949,6861,14818,6611,14679,6349,14538,6067,14398,5651,14189,5311,13935,4958,15359,4123,15359,4153,15356,4296,15353,4646,15338,5160,15311,5508,15263,5829,15188,6042,15088,6094,14966,6001,14826,5796,14678,5543,14527,5287,14377,4985,14133,4586,13869,4257,15360,1563,15360,1642,15358,2076,15354,2636,15341,3350,15317,4019,15273,4429,15203,4732,15105,4911,14981,4932,14836,4818,14679,4621,14517,4386,14359,4156,14083,3795,13808,3437,15360,122,15360,137,15358,285,15355,636,15344,1274,15322,2177,15281,2765,15215,3223,15120,3451,14995,3569,14846,3567,14681,3466,14511,3305,14344,3121,14037,2800,13753,2467,15360,0,15360,1,15359,21,15355,89,15346,253,15325,479,15287,796,15225,1148,15133,1492,15008,1749,14856,1882,14685,1886,14506,1783,14324,1608,13996,1398,13702,1183]);let ei=null;function u1(){return ei===null&&(ei=new Nn(h1,16,16,Ji,Zn),ei.name="DFG_LUT",ei.minFilter=Ae,ei.magFilter=Ae,ei.wrapS=yn,ei.wrapT=yn,ei.generateMipmaps=!1,ei.needsUpdate=!0),ei}class Fm{constructor(t={}){const{canvas:e=Ap(),context:n=null,depth:i=!0,stencil:r=!1,alpha:a=!1,antialias:o=!1,premultipliedAlpha:l=!0,preserveDrawingBuffer:c=!1,powerPreference:h="default",failIfMajorPerformanceCaveat:f=!1,reversedDepthBuffer:u=!1,outputBufferType:d=_n}=t;this.isWebGLRenderer=!0;let p;if(n!==null){if(typeof WebGLRenderingContext<"u"&&n instanceof WebGLRenderingContext)throw new Error("THREE.WebGLRenderer: WebGL 1 is not supported since r163.");p=n.getContextAttributes().alpha}else p=a;const _=d,g=new Set([ql,Xl,Na]),m=new Set([_n,Un,pr,mr,Gl,Hl]),x=new Uint32Array(4),M=new Int32Array(4),y=new I;let w=null,b=null;const E=[],v=[];let T=null;this.domElement=e,this.debug={checkShaderErrors:!0,diagnostics:{keywords:!1},onShaderError:null},this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this.toneMapping=Yn,this.toneMappingExposure=1,this.transmissionResolutionScale=1;const C=this;let P=!1,L=null,N=null,D=null,O=null;this._outputColorSpace=cn;let V=0,z=0,G=null,X=-1,$=null;const Z=new xe,ct=new xe;let bt=null;const $t=new ut(0);let Wt=0,Qt=e.width,K=e.height,tt=1,ft=null,kt=null;const Tt=new xe(0,0,Qt,K),Xt=new xe(0,0,Qt,K);let ge=!1;const nt=new Es;let rt=!1,at=!1;const ot=new Yt,dt=new I,Vt=new xe,Bt={background:null,fog:null,environment:null,overrideMaterial:null,isScene:!0};let qt=!1;function Kt(){return G===null?tt:1}let U=n;function de(A,F){return e.getContext(A,F)}let ie,R,S,k,q,J,lt,ht,Q,et,mt,Ut,vt,gt,Ft,Gt,jt,B,_t,j,xt,At,st;try{const A={alpha:!0,depth:i,stencil:r,antialias:o,premultipliedAlpha:l,preserveDrawingBuffer:c,powerPreference:h,failIfMajorPerformanceCaveat:f};if("setAttribute"in e&&e.setAttribute("data-engine",`three.js r${Bl}`),e.addEventListener("webglcontextlost",Me,!1),e.addEventListener("webglcontextrestored",fe,!1),e.addEventListener("webglcontextcreationerror",Bn,!1),U===null){const F="webgl2";if(U=de(F,A),U===null)throw de(F)?new Error("THREE.WebGLRenderer: Error creating WebGL context with your selected attributes."):new Error("THREE.WebGLRenderer: Error creating WebGL context.")}Ot()}catch(A){throw e.removeEventListener("webglcontextlost",Me,!1),e.removeEventListener("webglcontextrestored",fe,!1),e.removeEventListener("webglcontextcreationerror",Bn,!1),Nt("WebGLRenderer: "+A.message),A}function Ot(){ie=new dS(U),ie.init(),xt=new Nm(U,ie),R=new nS(U,ie,t,xt),S=new e1(U,ie),R.reversedDepthBuffer&&u&&S.buffers.depth.setReversed(!0),N=U.createFramebuffer(),D=U.createFramebuffer(),O=U.createFramebuffer(),k=new mS(U),q=new Vb,J=new n1(U,ie,S,q,R,xt,k),lt=new uS(C),ht=new _y(U),At=new tS(U,ht),Q=new fS(U,ht,k,At),et=new _S(U,Q,ht,At,k),B=new gS(U,R,J),Ft=new iS(q),mt=new kb(C,lt,ie,R,At,Ft),Ut=new l1(C,q),vt=new Hb,gt=new $b(ie),jt=new jM(C,lt,S,et,p,l),Gt=new t1(C,et,R),st=new c1(U,k,R,S),_t=new eS(U,ie,k),j=new pS(U,ie,k),k.programs=mt.programs,C.capabilities=R,C.extensions=ie,C.properties=q,C.renderLists=vt,C.shadowMap=Gt,C.state=S,C.info=k}_!==_n&&(T=new yS(_,e.width,e.height,o,i,r));const Lt=new a1(C,U);this.xr=Lt,this.getContext=function(){return U},this.getContextAttributes=function(){return U.getContextAttributes()},this.forceContextLoss=function(){const A=ie.get("WEBGL_lose_context");A&&A.loseContext()},this.forceContextRestore=function(){const A=ie.get("WEBGL_lose_context");A&&A.restoreContext()},this.getPixelRatio=function(){return tt},this.setPixelRatio=function(A){A!==void 0&&(tt=A,this.setSize(Qt,K,!1))},this.getSize=function(A){return A.set(Qt,K)},this.setSize=function(A,F,Y=!0){if(Lt.isPresenting){pt("WebGLRenderer: Can't change size while VR device is presenting.");return}Qt=A,K=F,e.width=Math.floor(A*tt),e.height=Math.floor(F*tt),Y===!0&&(e.style.width=A+"px",e.style.height=F+"px"),T!==null&&T.setSize(e.width,e.height),this.setViewport(0,0,A,F)},this.getDrawingBufferSize=function(A){return A.set(Qt*tt,K*tt).floor()},this.setDrawingBufferSize=function(A,F,Y){Qt=A,K=F,tt=Y,e.width=Math.floor(A*Y),e.height=Math.floor(F*Y),this.setViewport(0,0,A,F)},this.setEffects=function(A){if(_===_n){Nt("WebGLRenderer: setEffects() requires outputBufferType set to HalfFloatType or FloatType.");return}if(A){for(let F=0;F<A.length;F++)if(A[F].isOutputPass===!0){pt("WebGLRenderer: OutputPass is not needed in setEffects(). Tone mapping and color space conversion are applied automatically.");break}}T.setEffects(A||[])},this.getCurrentViewport=function(A){return A.copy(Z)},this.getViewport=function(A){return A.copy(Tt)},this.setViewport=function(A,F,Y,H){A.isVector4?Tt.set(A.x,A.y,A.z,A.w):Tt.set(A,F,Y,H),S.viewport(Z.copy(Tt).multiplyScalar(tt).round())},this.getScissor=function(A){return A.copy(Xt)},this.setScissor=function(A,F,Y,H){A.isVector4?Xt.set(A.x,A.y,A.z,A.w):Xt.set(A,F,Y,H),S.scissor(ct.copy(Xt).multiplyScalar(tt).round())},this.getScissorTest=function(){return ge},this.setScissorTest=function(A){S.setScissorTest(ge=A)},this.setOpaqueSort=function(A){ft=A},this.setTransparentSort=function(A){kt=A},this.getClearColor=function(A){return A.copy(jt.getClearColor())},this.setClearColor=function(){jt.setClearColor(...arguments)},this.getClearAlpha=function(){return jt.getClearAlpha()},this.setClearAlpha=function(){jt.setClearAlpha(...arguments)},this.clear=function(A=!0,F=!0,Y=!0){let H=0;if(A){let W=!1;if(G!==null){const wt=G.texture.format;W=g.has(wt)}if(W){const wt=G.texture.type,Ct=m.has(wt),St=jt.getClearColor(),Rt=jt.getClearAlpha(),Dt=St.r,ne=St.g,se=St.b;Ct?(x[0]=Dt,x[1]=ne,x[2]=se,x[3]=Rt,U.clearBufferuiv(U.COLOR,0,x)):(M[0]=Dt,M[1]=ne,M[2]=se,M[3]=Rt,U.clearBufferiv(U.COLOR,0,M))}else H|=U.COLOR_BUFFER_BIT}F&&(H|=U.DEPTH_BUFFER_BIT,this.state.buffers.depth.setMask(!0)),Y&&(H|=U.STENCIL_BUFFER_BIT,this.state.buffers.stencil.setMask(4294967295)),H!==0&&U.clear(H)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.setNodesHandler=function(A){A.setRenderer(this),L=A},this.dispose=function(){e.removeEventListener("webglcontextlost",Me,!1),e.removeEventListener("webglcontextrestored",fe,!1),e.removeEventListener("webglcontextcreationerror",Bn,!1),jt.dispose(),vt.dispose(),gt.dispose(),q.dispose(),lt.dispose(),et.dispose(),At.dispose(),st.dispose(),mt.dispose(),Lt.dispose(),Lt.removeEventListener("sessionstart",Zu),Lt.removeEventListener("sessionend",$u),is.stop()};function Me(A){A.preventDefault(),ba("WebGLRenderer: Context Lost."),P=!0}function fe(){ba("WebGLRenderer: Context Restored."),P=!1;const A=k.autoReset,F=Gt.enabled,Y=Gt.autoUpdate,H=Gt.needsUpdate,W=Gt.type;Ot(),k.autoReset=A,Gt.enabled=F,Gt.autoUpdate=Y,Gt.needsUpdate=H,Gt.type=W}function Bn(A){Nt("WebGLRenderer: A WebGL context could not be created. Reason: ",A.statusMessage)}function Qn(A){const F=A.target;F.removeEventListener("dispose",Qn),cg(F)}function cg(A){hg(A),q.remove(A)}function hg(A){const F=q.get(A).programs;F!==void 0&&(F.forEach(function(Y){mt.releaseProgram(Y)}),A.isShaderMaterial&&mt.releaseShaderCache(A))}this.renderBufferDirect=function(A,F,Y,H,W,wt){F===null&&(F=Bt);const Ct=W.isMesh&&W.matrixWorld.determinantAffine()<0,St=fg(A,F,Y,H,W);S.setMaterial(H,Ct);let Rt=Y.index,Dt=1;if(H.wireframe===!0){if(Rt=Q.getWireframeAttribute(Y),Rt===void 0)return;Dt=2}const ne=Y.drawRange,se=Y.attributes.position;let It=ne.start*Dt,pe=(ne.start+ne.count)*Dt;wt!==null&&(It=Math.max(It,wt.start*Dt),pe=Math.min(pe,(wt.start+wt.count)*Dt)),Rt!==null?(It=Math.max(It,0),pe=Math.min(pe,Rt.count)):se!=null&&(It=Math.max(It,0),pe=Math.min(pe,se.count));const ze=pe-It;if(ze<0||ze===1/0)return;At.setup(W,H,St,Y,Rt);let we,ve=_t;if(Rt!==null&&(we=ht.get(Rt),ve=j,ve.setIndex(we)),W.isMesh)H.wireframe===!0?(S.setLineWidth(H.wireframeLinewidth*Kt()),ve.setMode(U.LINES)):ve.setMode(U.TRIANGLES);else if(W.isLine){let $e=H.linewidth;$e===void 0&&($e=1),S.setLineWidth($e*Kt()),W.isLineSegments?ve.setMode(U.LINES):W.isLineLoop?ve.setMode(U.LINE_LOOP):ve.setMode(U.LINE_STRIP)}else W.isPoints?ve.setMode(U.POINTS):W.isSprite&&ve.setMode(U.TRIANGLES);if(W.isBatchedMesh)if(ie.get("WEBGL_multi_draw"))ve.renderMultiDraw(W._multiDrawStarts,W._multiDrawCounts,W._multiDrawCount);else{const $e=W._multiDrawStarts,Et=W._multiDrawCounts,an=W._multiDrawCount,oe=Rt?ht.get(Rt).bytesPerElement:1,In=q.get(H).currentProgram.getUniforms();for(let jn=0;jn<an;jn++)In.setValue(U,"_gl_DrawID",jn),ve.render($e[jn]/oe,Et[jn])}else if(W.isInstancedMesh)ve.renderInstances(It,ze,W.count);else if(Y.isInstancedBufferGeometry){const $e=Y._maxInstanceCount!==void 0?Y._maxInstanceCount:1/0,Et=Math.min(Y.instanceCount,$e);ve.renderInstances(It,ze,Et)}else ve.render(It,ze)};function Yu(A,F,Y,H){L!==null&&A.isNodeMaterial&&L.setObject(H,A),rt===!0&&Ft.setState(A,Y,!1),A.transparent===!0&&A.side===Xn&&A.forceSinglePass===!1?(A.side=nn,A.needsUpdate=!0,Ha(A,F,H),A.side=Ii,A.needsUpdate=!0,Ha(A,F,H),A.side=Xn):Ha(A,F,H)}this.compile=function(A,F,Y=null){Y===null&&(Y=A),L!==null&&L.renderStart(A,F,Y),b=gt.get(Y),b.init(F),v.push(b),Y.traverseVisible(function(W){W.isLight&&W.layers.test(F.layers)&&(b.pushLight(W),W.castShadow&&b.pushShadow(W))}),A!==Y&&A.traverseVisible(function(W){W.isLight&&W.layers.test(F.layers)&&(b.pushLight(W),W.castShadow&&b.pushShadow(W))}),b.setupLights(),L!==null&&L.updateLights(b.state.lightsArray),at=this.localClippingEnabled,rt=Ft.init(this.clippingPlanes,at),rt===!0&&Ft.setGlobalState(this.clippingPlanes,F),L!==null&&Gt.render(b.state.shadowsArray,Y,F);const H=new Set;return A.traverse(function(W){if(!(W.isMesh||W.isPoints||W.isLine||W.isSprite))return;const wt=W.material;if(wt)if(Array.isArray(wt))for(let Ct=0;Ct<wt.length;Ct++){const St=wt[Ct];Yu(St,Y,F,W),H.add(St)}else Yu(wt,Y,F,W),H.add(wt)}),b=v.pop(),L!==null&&L.renderEnd(),H},this.compileAsync=function(A,F,Y=null){const H=this.compile(A,F,Y);return new Promise(W=>{function wt(){if(H.forEach(function(Ct){const Rt=q.get(Ct).currentProgram;(Rt===void 0||Rt.isReady())&&H.delete(Ct)}),H.size===0){W(A);return}setTimeout(wt,10)}ie.get("KHR_parallel_shader_compile")!==null?wt():setTimeout(wt,10)})};let Cc=null;function ug(A){Cc&&Cc(A)}function Zu(){is.stop()}function $u(){is.start()}const is=new Cm;is.setAnimationLoop(ug),typeof self<"u"&&is.setContext(self),this.setAnimationLoop=function(A){Cc=A,Lt.setAnimationLoop(A),A===null?is.stop():is.start()},Lt.addEventListener("sessionstart",Zu),Lt.addEventListener("sessionend",$u),this.render=function(A,F){if(F!==void 0&&F.isCamera!==!0){Nt("WebGLRenderer.render: camera is not an instance of THREE.Camera.");return}if(P===!0)return;L!==null&&L.renderStart(A,F);const Y=Lt.enabled===!0&&Lt.isPresenting===!0,H=T!==null&&(G===null||Y)&&T.begin(C,G);if(A.matrixWorldAutoUpdate===!0&&A.updateMatrixWorld(),F.parent===null&&F.matrixWorldAutoUpdate===!0&&F.updateMatrixWorld(),Lt.enabled===!0&&Lt.isPresenting===!0&&(T===null||T.isCompositing()===!1)&&(Lt.cameraAutoUpdate===!0&&Lt.updateCamera(F),F=Lt.getCamera()),A.isScene===!0&&A.onBeforeRender(C,A,F,G),b=gt.get(A,v.length),b.init(F),b.state.textureUnits=J.getTextureUnits(),v.push(b),ot.multiplyMatrices(F.projectionMatrix,F.matrixWorldInverse),nt.setFromProjectionMatrix(ot,En,F.reversedDepth),at=this.localClippingEnabled,rt=Ft.init(this.clippingPlanes,at),w=vt.get(A,E.length),w.init(),E.push(w),Lt.enabled===!0&&Lt.isPresenting===!0){const Ct=C.xr.getDepthSensingMesh();Ct!==null&&Rc(Ct,F,-1/0,C.sortObjects)}Rc(A,F,0,C.sortObjects),w.finish(),L!==null&&L.updateLights(b.state.lightsArray),C.sortObjects===!0&&w.sort(ft,kt),qt=Lt.enabled===!1||Lt.isPresenting===!1||Lt.hasDepthSensing()===!1,qt&&jt.addToRenderList(w,A),this.info.render.frame++,this.info.autoReset===!0&&this.info.reset(),rt===!0&&Ft.beginShadows();const W=b.state.shadowsArray;if(Gt.render(W,A,F),rt===!0&&Ft.endShadows(),(H&&T.hasRenderPass())===!1){const Ct=w.opaque,St=w.transmissive;if(b.setupLights(),F.isArrayCamera){const Rt=F.cameras;if(St.length>0)for(let Dt=0,ne=Rt.length;Dt<ne;Dt++){const se=Rt[Dt];Ku(Ct,St,A,se)}qt&&jt.render(A);for(let Dt=0,ne=Rt.length;Dt<ne;Dt++){const se=Rt[Dt];Ju(w,A,se,se.viewport)}}else St.length>0&&Ku(Ct,St,A,F),qt&&jt.render(A),Ju(w,A,F)}G!==null&&z===0&&(J.updateMultisampleRenderTarget(G),J.updateRenderTargetMipmap(G)),H&&T.end(C),A.isScene===!0&&A.onAfterRender(C,A,F),At.resetDefaultState(),X=-1,$=null,v.pop(),v.length>0?(b=v[v.length-1],J.setTextureUnits(b.state.textureUnits),rt===!0&&Ft.setGlobalState(C.clippingPlanes,b.state.camera)):b=null,E.pop(),E.length>0?w=E[E.length-1]:w=null,L!==null&&L.renderEnd()};function Rc(A,F,Y,H){if(A.visible===!1)return;if(A.layers.test(F.layers)){if(A.isGroup)Y=A.renderOrder;else if(A.isLOD)A.autoUpdate===!0&&A.update(F);else if(A.isLightProbeGrid)b.pushLightProbeGrid(A);else if(A.isLight)b.pushLight(A),A.castShadow&&b.pushShadow(A);else if(A.isSprite){if(!A.frustumCulled||A.intersectsFrustum(nt)){H&&Vt.setFromMatrixPosition(A.matrixWorld).applyMatrix4(ot);const Ct=et.update(A),St=A.material;St.visible&&w.push(A,Ct,St,Y,Vt.z,null,F)}}else if((A.isMesh||A.isLine||A.isPoints)&&(!A.frustumCulled||A.intersectsFrustum(nt))){const Ct=et.update(A),St=A.material;if(H&&(A.boundingSphere!==void 0?(A.boundingSphere===null&&A.computeBoundingSphere(),Vt.copy(A.boundingSphere.center)):(Ct.boundingSphere===null&&Ct.computeBoundingSphere(),Vt.copy(Ct.boundingSphere.center)),Vt.applyMatrix4(A.matrixWorld).applyMatrix4(ot)),Array.isArray(St)){const Rt=Ct.groups;for(let Dt=0,ne=Rt.length;Dt<ne;Dt++){const se=Rt[Dt],It=St[se.materialIndex];It&&It.visible&&w.push(A,Ct,It,Y,Vt.z,se,F)}}else St.visible&&w.push(A,Ct,St,Y,Vt.z,null,F)}}const wt=A.children;for(let Ct=0,St=wt.length;Ct<St;Ct++)Rc(wt[Ct],F,Y,H)}function Ju(A,F,Y,H){const{opaque:W,transmissive:wt,transparent:Ct}=A;b.setupLightsView(Y),rt===!0&&Ft.setGlobalState(C.clippingPlanes,Y),H&&S.viewport(Z.copy(H)),W.length>0&&Ga(W,F,Y),wt.length>0&&Ga(wt,F,Y),Ct.length>0&&Ga(Ct,F,Y),S.buffers.depth.setTest(!0),S.buffers.depth.setMask(!0),S.buffers.color.setMask(!0),S.setPolygonOffset(!1)}function Ku(A,F,Y,H){if((Y.isScene===!0?Y.overrideMaterial:null)!==null)return;if(b.state.transmissionRenderTarget[H.id]===void 0){const It=ie.has("EXT_color_buffer_half_float")||ie.has("EXT_color_buffer_float");b.state.transmissionRenderTarget[H.id]=new Mn(1,1,{generateMipmaps:!0,type:It?Zn:_n,minFilter:ri,samples:Math.max(4,R.samples),stencilBuffer:r,resolveDepthBuffer:!1,resolveStencilBuffer:!1,storeMultisampledDepthBuffer:!1,storeMultisampledStencilBuffer:!1,colorSpace:ae.workingColorSpace})}const wt=b.state.transmissionRenderTarget[H.id],Ct=H.viewport||Z;wt.setSize(Ct.z*C.transmissionResolutionScale,Ct.w*C.transmissionResolutionScale);const St=C.getRenderTarget(),Rt=C.getActiveCubeFace(),Dt=C.getActiveMipmapLevel();C.setRenderTarget(wt),C.getClearColor($t),Wt=C.getClearAlpha(),Wt<1&&C.setClearColor(16777215,.5),C.clear(),qt&&jt.render(Y);const ne=C.toneMapping;C.toneMapping=Yn;const se=H.viewport;if(H.viewport!==void 0&&(H.viewport=void 0),b.setupLightsView(H),rt===!0&&Ft.setGlobalState(C.clippingPlanes,H),Ga(A,Y,H),J.updateMultisampleRenderTarget(wt),J.updateRenderTargetMipmap(wt),ie.has("WEBGL_multisampled_render_to_texture")===!1){let It=!1;for(let pe=0,ze=F.length;pe<ze;pe++){const we=F[pe],{object:ve,geometry:$e,material:Et,group:an}=we;if(Et.side===Xn&&ve.layers.test(H.layers)){const oe=Et.side;Et.side=nn,Et.needsUpdate=!0,Qu(ve,Y,H,$e,Et,an),Et.side=oe,Et.needsUpdate=!0,It=!0}}It===!0&&(J.updateMultisampleRenderTarget(wt),J.updateRenderTargetMipmap(wt))}C.setRenderTarget(St,Rt,Dt),C.setClearColor($t,Wt),se!==void 0&&(H.viewport=se),C.toneMapping=ne}function Ga(A,F,Y){const H=F.isScene===!0?F.overrideMaterial:null;for(let W=0,wt=A.length;W<wt;W++){const Ct=A[W],{object:St,geometry:Rt,group:Dt}=Ct;let ne=Ct.material;ne.allowOverride===!0&&H!==null&&(ne=H),St.layers.test(Y.layers)&&Qu(St,F,Y,Rt,ne,Dt)}}function Qu(A,F,Y,H,W,wt){L!==null&&W.isNodeMaterial&&L.setObject(A,W),A.onBeforeRender(C,F,Y,H,W,wt),A.modelViewMatrix.multiplyMatrices(Y.matrixWorldInverse,A.matrixWorld),A.normalMatrix.getNormalMatrix(A.modelViewMatrix),W.onBeforeRender(C,F,Y,H,A,wt),W.transparent===!0&&W.side===Xn&&W.forceSinglePass===!1?(W.side=nn,W.needsUpdate=!0,C.renderBufferDirect(Y,F,H,W,A,wt),W.side=Ii,W.needsUpdate=!0,C.renderBufferDirect(Y,F,H,W,A,wt),W.side=Xn):C.renderBufferDirect(Y,F,H,W,A,wt),A.onAfterRender(C,F,Y,H,W,wt)}function Ha(A,F,Y){F.isScene!==!0&&(F=Bt);const H=q.get(A),W=b.state.lights,wt=b.state.shadowsArray,Ct=W.state.version,St=mt.getParameters(A,W.state,wt,F,Y,b.state.lightProbeGridArray),Rt=mt.getProgramCacheKey(St);let Dt=H.programs;H.environment=A.isMeshStandardMaterial||A.isMeshLambertMaterial||A.isMeshPhongMaterial?F.environment:null,H.fog=F.fog;const ne=A.isMeshStandardMaterial||A.isMeshLambertMaterial&&!A.envMap||A.isMeshPhongMaterial&&!A.envMap;H.envMap=lt.get(A.envMap||H.environment,ne),H.envMapRotation=H.environment!==null&&A.envMap===null?F.environmentRotation:A.envMapRotation,Dt===void 0&&(A.addEventListener("dispose",Qn),Dt=new Map,H.programs=Dt);let se=Dt.get(Rt);if(se!==void 0){if(H.currentProgram===se&&H.lightsStateVersion===Ct)return td(A,St),se}else St.uniforms=mt.getUniforms(A),L!==null&&A.isNodeMaterial&&L.build(A,Y,St),A.onBeforeCompile(St,C),se=mt.acquireProgram(St,Rt),Dt.set(Rt,se),H.uniforms=St.uniforms;const It=H.uniforms;return(!A.isShaderMaterial&&!A.isRawShaderMaterial||A.clipping===!0)&&(It.clippingPlanes=Ft.uniform),td(A,St),H.needsLights=mg(A),H.lightsStateVersion=Ct,H.needsLights&&(It.ambientLightColor.value=W.state.ambient,It.lightProbe.value=W.state.probe,It.sunLights.value=W.state.sun,It.sunLightShadows.value=W.state.sunShadow,It.directionalLights.value=W.state.directional,It.directionalLightShadows.value=W.state.directionalShadow,It.spotLights.value=W.state.spot,It.spotLightShadows.value=W.state.spotShadow,It.rectAreaLights.value=W.state.rectArea,It.ltc_1.value=W.state.rectAreaLTC1,It.ltc_2.value=W.state.rectAreaLTC2,It.pointLights.value=W.state.point,It.pointLightShadows.value=W.state.pointShadow,It.hemisphereLights.value=W.state.hemi,It.sunShadowMatrix.value=W.state.sunShadowMatrix,It.sunShadowCascade.value=W.state.sunShadowCascade,It.directionalShadowMatrix.value=W.state.directionalShadowMatrix,It.spotLightMatrix.value=W.state.spotLightMatrix,It.spotLightMap.value=W.state.spotLightMap,It.pointShadowMatrix.value=W.state.pointShadowMatrix),H.lightProbeGrid=b.state.lightProbeGridArray.length>0,H.currentProgram=se,H.uniformsList=null,se}function ju(A){if(A.uniformsList===null){const F=A.currentProgram.getUniforms();A.uniformsList=Wo.seqWithValue(F.seq,A.uniforms)}return A.uniformsList}function td(A,F){const Y=q.get(A);Y.outputColorSpace=F.outputColorSpace,Y.batching=F.batching,Y.batchingColor=F.batchingColor,Y.instancing=F.instancing,Y.instancingColor=F.instancingColor,Y.instancingMorph=F.instancingMorph,Y.skinning=F.skinning,Y.morphTargets=F.morphTargets,Y.morphNormals=F.morphNormals,Y.morphColors=F.morphColors,Y.morphTargetsCount=F.morphTargetsCount,Y.numClippingPlanes=F.numClippingPlanes,Y.numIntersection=F.numClipIntersection,Y.vertexAlphas=F.vertexAlphas,Y.vertexTangents=F.vertexTangents,Y.toneMapping=F.toneMapping}function dg(A,F){if(A.length===0)return null;if(A.length===1)return A[0].texture!==null?A[0]:null;y.setFromMatrixPosition(F.matrixWorld);for(let Y=0,H=A.length;Y<H;Y++){const W=A[Y];if(W.texture!==null&&W.boundingBox.containsPoint(y))return W}return null}function fg(A,F,Y,H,W){F.isScene!==!0&&(F=Bt),J.resetTextureUnits();const wt=F.fog,Ct=H.isMeshStandardMaterial||H.isMeshLambertMaterial||H.isMeshPhongMaterial?F.environment:null,St=G===null?C.outputColorSpace:G.isXRRenderTarget===!0?G.texture.colorSpace:ae.workingColorSpace,Rt=H.isMeshStandardMaterial||H.isMeshLambertMaterial&&!H.envMap||H.isMeshPhongMaterial&&!H.envMap,Dt=lt.get(H.envMap||Ct,Rt),ne=H.vertexColors===!0&&!!Y.attributes.color&&Y.attributes.color.itemSize===4,se=!!Y.attributes.tangent&&(!!H.normalMap||H.anisotropy>0),It=!!Y.morphAttributes.position,pe=!!Y.morphAttributes.normal,ze=!!Y.morphAttributes.color;let we=Yn;H.toneMapped&&(G===null||G.isXRRenderTarget===!0)&&(we=C.toneMapping);const ve=Y.morphAttributes.position||Y.morphAttributes.normal||Y.morphAttributes.color,$e=ve!==void 0?ve.length:0,Et=q.get(H),an=b.state.lights;if(rt===!0&&(at===!0||A!==$)){const Se=A===$&&H.id===X;Ft.setState(H,A,Se)}let oe=!1;H.version===Et.__version?(Et.needsLights&&Et.lightsStateVersion!==an.state.version||Et.outputColorSpace!==St||W.isBatchedMesh&&Et.batching===!1||!W.isBatchedMesh&&Et.batching===!0||W.isBatchedMesh&&Et.batchingColor===!0&&W._colorsTexture===null||W.isBatchedMesh&&Et.batchingColor===!1&&W._colorsTexture!==null||W.isInstancedMesh&&Et.instancing===!1||!W.isInstancedMesh&&Et.instancing===!0||W.isSkinnedMesh&&Et.skinning===!1||!W.isSkinnedMesh&&Et.skinning===!0||W.isInstancedMesh&&Et.instancingColor===!0&&W.instanceColor===null||W.isInstancedMesh&&Et.instancingColor===!1&&W.instanceColor!==null||W.isInstancedMesh&&Et.instancingMorph===!0&&W.morphTexture===null||W.isInstancedMesh&&Et.instancingMorph===!1&&W.morphTexture!==null||Et.envMap!==Dt||H.fog===!0&&Et.fog!==wt||Et.numClippingPlanes!==void 0&&(Et.numClippingPlanes!==Ft.numPlanes||Et.numIntersection!==Ft.numIntersection)||Et.vertexAlphas!==ne||Et.vertexTangents!==se||Et.morphTargets!==It||Et.morphNormals!==pe||Et.morphColors!==ze||Et.toneMapping!==we||Et.morphTargetsCount!==$e||!!Et.lightProbeGrid!=b.state.lightProbeGridArray.length>0)&&(oe=!0):(oe=!0,Et.__version=H.version);let In=Et.currentProgram;oe===!0&&(In=Ha(H,F,W),L&&H.isNodeMaterial&&L.onUpdateProgram(H,In,Et));let jn=!1,Ui=!1,Ns=!1;const ye=In.getUniforms(),Le=Et.uniforms;if(S.useProgram(In.program)&&(jn=!0,Ui=!0,Ns=!0),H.id!==X&&(X=H.id,Ui=!0),Et.needsLights){const Se=dg(b.state.lightProbeGridArray,W);Et.lightProbeGrid!==Se&&(Et.lightProbeGrid=Se,Ui=!0)}if(jn||$!==A){S.buffers.depth.getReversed()&&A.reversedDepth!==!0&&(A._reversedDepth=!0,A.updateProjectionMatrix()),ye.setValue(U,"projectionMatrix",A.projectionMatrix),ye.setValue(U,"viewMatrix",A.matrixWorldInverse);const Oi=ye.map.cameraPosition;Oi!==void 0&&Oi.setValue(U,dt.setFromMatrixPosition(A.matrixWorld)),R.logarithmicDepthBuffer&&ye.setValue(U,"logDepthBufFC",2/(Math.log(A.far+1)/Math.LN2)),(H.isMeshPhongMaterial||H.isMeshToonMaterial||H.isMeshLambertMaterial||H.isMeshBasicMaterial||H.isMeshStandardMaterial||H.isShaderMaterial)&&ye.setValue(U,"isOrthographic",A.isOrthographicCamera===!0),$!==A&&($=A,Ui=!0,Ns=!0)}if(Et.needsLights&&(an.state.sunShadowMap.length>0&&ye.setValue(U,"sunShadowMap",an.state.sunShadowMap,J),an.state.directionalShadowMap.length>0&&ye.setValue(U,"directionalShadowMap",an.state.directionalShadowMap,J),an.state.spotShadowMap.length>0&&ye.setValue(U,"spotShadowMap",an.state.spotShadowMap,J),an.state.pointShadowMap.length>0&&ye.setValue(U,"pointShadowMap",an.state.pointShadowMap,J)),W.isSkinnedMesh){ye.setOptional(U,W,"bindMatrix"),ye.setOptional(U,W,"bindMatrixInverse");const Se=W.skeleton;Se&&(Se.boneTexture===null&&Se.computeBoneTexture(),ye.setValue(U,"boneTexture",Se.boneTexture,J))}W.isBatchedMesh&&(ye.setOptional(U,W,"batchingTexture"),ye.setValue(U,"batchingTexture",W._matricesTexture,J),ye.setOptional(U,W,"batchingIdTexture"),ye.setValue(U,"batchingIdTexture",W._indirectTexture,J),ye.setOptional(U,W,"batchingColorTexture"),W._colorsTexture!==null&&ye.setValue(U,"batchingColorTexture",W._colorsTexture,J));const Fi=Y.morphAttributes;if((Fi.position!==void 0||Fi.normal!==void 0||Fi.color!==void 0)&&B.update(W,Y,In),(Ui||Et.receiveShadow!==W.receiveShadow)&&(Et.receiveShadow=W.receiveShadow,ye.setValue(U,"receiveShadow",W.receiveShadow)),(H.isMeshStandardMaterial||H.isMeshLambertMaterial||H.isMeshPhongMaterial)&&H.envMap===null&&F.environment!==null&&(Le.envMapIntensity.value=F.environmentIntensity),Le.dfgLUT!==void 0&&(Le.dfgLUT.value=u1()),Ui){if(ye.setValue(U,"toneMappingExposure",C.toneMappingExposure),Et.needsLights&&pg(Le,Ns),wt&&H.fog===!0&&Ut.refreshFogUniforms(Le,wt),Ut.refreshMaterialUniforms(Le,H,tt,K,b.state.transmissionRenderTarget[A.id]),Et.needsLights&&Et.lightProbeGrid){const Se=Et.lightProbeGrid;Le.probesSH.value=Se.texture,Le.probesMin.value.copy(Se.boundingBox.min),Le.probesMax.value.copy(Se.boundingBox.max),Le.probesResolution.value.copy(Se.resolution)}Wo.upload(U,ju(Et),Le,J)}if(H.isShaderMaterial&&H.uniformsNeedUpdate===!0&&(Wo.upload(U,ju(Et),Le,J),H.uniformsNeedUpdate=!1),H.isSpriteMaterial&&ye.setValue(U,"center",W.center),ye.setValue(U,"modelViewMatrix",W.modelViewMatrix),ye.setValue(U,"normalMatrix",W.normalMatrix),ye.setValue(U,"modelMatrix",W.matrixWorld),H.uniformsGroups!==void 0){const Se=H.uniformsGroups;for(let Oi=0,Us=Se.length;Oi<Us;Oi++){const nd=Se[Oi];st.update(nd,In),st.bind(nd,In)}}return In}function pg(A,F){A.ambientLightColor.needsUpdate=F,A.lightProbe.needsUpdate=F,A.sunLights.needsUpdate=F,A.sunLightShadows.needsUpdate=F,A.directionalLights.needsUpdate=F,A.directionalLightShadows.needsUpdate=F,A.pointLights.needsUpdate=F,A.pointLightShadows.needsUpdate=F,A.spotLights.needsUpdate=F,A.spotLightShadows.needsUpdate=F,A.rectAreaLights.needsUpdate=F,A.hemisphereLights.needsUpdate=F}function mg(A){return A.isMeshLambertMaterial||A.isMeshToonMaterial||A.isMeshPhongMaterial||A.isMeshStandardMaterial||A.isShadowMaterial||A.isShaderMaterial&&A.lights===!0}this.getActiveCubeFace=function(){return V},this.getActiveMipmapLevel=function(){return z},this.getRenderTarget=function(){return G},this.setRenderTargetTextures=function(A,F,Y){const H=q.get(A);H.__autoAllocateDepthBuffer=A.resolveDepthBuffer===!1,H.__autoAllocateDepthBuffer===!1&&(H.__useRenderToTexture=!1),q.get(A.texture).__webglTexture=F,q.get(A.depthTexture).__webglTexture=H.__autoAllocateDepthBuffer?void 0:Y,H.__hasExternalTextures=!0},this.setRenderTargetFramebuffer=function(A,F){const Y=q.get(A);Y.__webglFramebuffer=F,Y.__useDefaultFramebuffer=F===void 0},this.setRenderTarget=function(A,F=0,Y=0){G=A,V=F,z=Y;let H=null,W=!1,wt=!1;if(A){const St=q.get(A);if(St.__useDefaultFramebuffer!==void 0){S.bindFramebuffer(U.FRAMEBUFFER,St.__webglFramebuffer),Z.copy(A.viewport),ct.copy(A.scissor),bt=A.scissorTest,S.viewport(Z),S.scissor(ct),S.setScissorTest(bt),X=-1;return}else if(St.__webglFramebuffer===void 0)J.setupRenderTarget(A);else if(St.__hasExternalTextures)J.rebindTextures(A,q.get(A.texture).__webglTexture,q.get(A.depthTexture).__webglTexture);else if(A.depthBuffer){const ne=A.depthTexture;if(St.__boundDepthTexture!==ne){if(ne!==null&&q.has(ne)&&(A.width!==ne.image.width||A.height!==ne.image.height))throw new Error("THREE.WebGLRenderer: Attached DepthTexture is initialized to the incorrect size.");J.setupDepthRenderbuffer(A)}}const Rt=A.texture;(Rt.isData3DTexture||Rt.isDataArrayTexture||Rt.isCompressedArrayTexture)&&(wt=!0);const Dt=q.get(A).__webglFramebuffer;A.isWebGLCubeRenderTarget?(Array.isArray(Dt[F])?H=Dt[F][Y]:H=Dt[F],W=!0):A.samples>0&&J.useMultisampledRTT(A)===!1?H=q.get(A).__webglMultisampledFramebuffer:Array.isArray(Dt)?H=Dt[Y]:H=Dt,Z.copy(A.viewport),ct.copy(A.scissor),bt=A.scissorTest}else Z.copy(Tt).multiplyScalar(tt).floor(),ct.copy(Xt).multiplyScalar(tt).floor(),bt=ge;if(Y!==0&&(H=N),S.bindFramebuffer(U.FRAMEBUFFER,H)&&S.drawBuffers(A,H),S.viewport(Z),S.scissor(ct),S.setScissorTest(bt),W){const St=q.get(A.texture);U.framebufferTexture2D(U.FRAMEBUFFER,U.COLOR_ATTACHMENT0,U.TEXTURE_CUBE_MAP_POSITIVE_X+F,St.__webglTexture,Y)}else if(wt){const St=F;for(let Rt=0;Rt<A.textures.length;Rt++){const Dt=q.get(A.textures[Rt]);U.framebufferTextureLayer(U.FRAMEBUFFER,U.COLOR_ATTACHMENT0+Rt,Dt.__webglTexture,Y,St)}}else if(A!==null&&Y!==0){const St=q.get(A.texture);U.framebufferTexture2D(U.FRAMEBUFFER,U.COLOR_ATTACHMENT0,U.TEXTURE_2D,St.__webglTexture,Y)}X=-1};function ed(A){const F=q.get(A);return(F.__readFormat!==A.format||F.__readType!==A.type)&&(F.__readFormat=A.format,F.__readType=A.type,F.__formatReadable=R.textureFormatReadable(A.format),F.__typeReadable=R.textureTypeReadable(A.type)),F}this.readRenderTargetPixels=function(A,F,Y,H,W,wt,Ct,St=0){if(!(A&&A.isWebGLRenderTarget)){Nt("WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");return}let Rt=q.get(A).__webglFramebuffer;if(A.isWebGLCubeRenderTarget&&Ct!==void 0&&(Rt=Rt[Ct]),Rt){S.bindFramebuffer(U.FRAMEBUFFER,Rt);try{const Dt=A.textures[St],ne=Dt.format,se=Dt.type;A.textures.length>1&&U.readBuffer(U.COLOR_ATTACHMENT0+St);const It=ed(Dt);if(It.__formatReadable===!1){Nt("WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.");return}if(It.__typeReadable===!1){Nt("WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.");return}F>=0&&F<=A.width-H&&Y>=0&&Y<=A.height-W&&U.readPixels(F,Y,H,W,xt.convert(ne),xt.convert(se),wt)}finally{const Dt=G!==null?q.get(G).__webglFramebuffer:null;S.bindFramebuffer(U.FRAMEBUFFER,Dt)}}},this.readRenderTargetPixelsAsync=async function(A,F,Y,H,W,wt,Ct,St=0){if(!(A&&A.isWebGLRenderTarget))throw new Error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");let Rt=q.get(A).__webglFramebuffer;if(A.isWebGLCubeRenderTarget&&Ct!==void 0&&(Rt=Rt[Ct]),Rt)if(F>=0&&F<=A.width-H&&Y>=0&&Y<=A.height-W){S.bindFramebuffer(U.FRAMEBUFFER,Rt);const Dt=A.textures[St],ne=Dt.format,se=Dt.type;A.textures.length>1&&U.readBuffer(U.COLOR_ATTACHMENT0+St);const It=ed(Dt);if(It.__formatReadable===!1)throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in RGBA or implementation defined format.");if(It.__typeReadable===!1)throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in UnsignedByteType or implementation defined type.");const pe=U.createBuffer();U.bindBuffer(U.PIXEL_PACK_BUFFER,pe),U.bufferData(U.PIXEL_PACK_BUFFER,wt.byteLength,U.STREAM_READ),U.readPixels(F,Y,H,W,xt.convert(ne),xt.convert(se),0),U.bindBuffer(U.PIXEL_PACK_BUFFER,null);const ze=G!==null?q.get(G).__webglFramebuffer:null;S.bindFramebuffer(U.FRAMEBUFFER,ze);const we=U.fenceSync(U.SYNC_GPU_COMMANDS_COMPLETE,0);return U.flush(),await f0(U,we,4),U.bindBuffer(U.PIXEL_PACK_BUFFER,pe),U.getBufferSubData(U.PIXEL_PACK_BUFFER,0,wt),U.bindBuffer(U.PIXEL_PACK_BUFFER,null),U.deleteBuffer(pe),U.deleteSync(we),wt}else throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: requested read bounds are out of range.")},this.copyFramebufferToTexture=function(A,F=null,Y=0){const H=Math.pow(2,-Y),W=Math.floor(A.image.width*H),wt=Math.floor(A.image.height*H),Ct=F!==null?F.x:0,St=F!==null?F.y:0;J.setTexture2D(A,0),U.copyTexSubImage2D(U.TEXTURE_2D,Y,0,0,Ct,St,W,wt),S.unbindTexture()},this.copyTextureToTexture=function(A,F,Y=null,H=null,W=0,wt=0){let Ct,St,Rt,Dt,ne,se,It,pe,ze;const we=A.isCompressedTexture?A.mipmaps[wt]:A.image;if(Y!==null)Ct=Y.max.x-Y.min.x,St=Y.max.y-Y.min.y,Rt=Y.isBox3?Y.max.z-Y.min.z:1,Dt=Y.min.x,ne=Y.min.y,se=Y.isBox3?Y.min.z:0;else{const Le=Math.pow(2,-W);Ct=Math.floor(we.width*Le),St=Math.floor(we.height*Le),A.isDataArrayTexture?Rt=we.depth:A.isData3DTexture?Rt=Math.floor(we.depth*Le):Rt=1,Dt=0,ne=0,se=0}H!==null?(It=H.x,pe=H.y,ze=H.z):(It=0,pe=0,ze=0);const ve=xt.convert(F.format),$e=xt.convert(F.type);let Et;F.isData3DTexture?(J.setTexture3D(F,0),Et=U.TEXTURE_3D):F.isDataArrayTexture||F.isCompressedArrayTexture?(J.setTexture2DArray(F,0),Et=U.TEXTURE_2D_ARRAY):(J.setTexture2D(F,0),Et=U.TEXTURE_2D),S.activeTexture(U.TEXTURE0),S.pixelStorei(U.UNPACK_FLIP_Y_WEBGL,F.flipY),S.pixelStorei(U.UNPACK_PREMULTIPLY_ALPHA_WEBGL,F.premultiplyAlpha),S.pixelStorei(U.UNPACK_ALIGNMENT,F.unpackAlignment);const an=S.getParameter(U.UNPACK_ROW_LENGTH),oe=S.getParameter(U.UNPACK_IMAGE_HEIGHT),In=S.getParameter(U.UNPACK_SKIP_PIXELS),jn=S.getParameter(U.UNPACK_SKIP_ROWS),Ui=S.getParameter(U.UNPACK_SKIP_IMAGES);S.pixelStorei(U.UNPACK_ROW_LENGTH,we.width),S.pixelStorei(U.UNPACK_IMAGE_HEIGHT,we.height),S.pixelStorei(U.UNPACK_SKIP_PIXELS,Dt),S.pixelStorei(U.UNPACK_SKIP_ROWS,ne),S.pixelStorei(U.UNPACK_SKIP_IMAGES,se);const Ns=A.isDataArrayTexture||A.isData3DTexture,ye=F.isDataArrayTexture||F.isData3DTexture;if(A.isDepthTexture){const Le=q.get(A),Fi=q.get(F),Se=q.get(Le.__renderTarget),Oi=q.get(Fi.__renderTarget);S.bindFramebuffer(U.READ_FRAMEBUFFER,Se.__webglFramebuffer),S.bindFramebuffer(U.DRAW_FRAMEBUFFER,Oi.__webglFramebuffer);for(let Us=0;Us<Rt;Us++)Ns&&(U.framebufferTextureLayer(U.READ_FRAMEBUFFER,U.COLOR_ATTACHMENT0,q.get(A).__webglTexture,W,se+Us),U.framebufferTextureLayer(U.DRAW_FRAMEBUFFER,U.COLOR_ATTACHMENT0,q.get(F).__webglTexture,wt,ze+Us)),U.blitFramebuffer(Dt,ne,Ct,St,It,pe,Ct,St,U.DEPTH_BUFFER_BIT,U.NEAREST);S.bindFramebuffer(U.READ_FRAMEBUFFER,null),S.bindFramebuffer(U.DRAW_FRAMEBUFFER,null)}else if(W!==0||A.isRenderTargetTexture||q.has(A)){const Le=q.get(A),Fi=q.get(F);S.bindFramebuffer(U.READ_FRAMEBUFFER,D),S.bindFramebuffer(U.DRAW_FRAMEBUFFER,O);for(let Se=0;Se<Rt;Se++)Ns?U.framebufferTextureLayer(U.READ_FRAMEBUFFER,U.COLOR_ATTACHMENT0,Le.__webglTexture,W,se+Se):U.framebufferTexture2D(U.READ_FRAMEBUFFER,U.COLOR_ATTACHMENT0,U.TEXTURE_2D,Le.__webglTexture,W),ye?U.framebufferTextureLayer(U.DRAW_FRAMEBUFFER,U.COLOR_ATTACHMENT0,Fi.__webglTexture,wt,ze+Se):U.framebufferTexture2D(U.DRAW_FRAMEBUFFER,U.COLOR_ATTACHMENT0,U.TEXTURE_2D,Fi.__webglTexture,wt),W!==0?U.blitFramebuffer(Dt,ne,Ct,St,It,pe,Ct,St,U.COLOR_BUFFER_BIT,U.NEAREST):ye?U.copyTexSubImage3D(Et,wt,It,pe,ze+Se,Dt,ne,Ct,St):U.copyTexSubImage2D(Et,wt,It,pe,Dt,ne,Ct,St);S.bindFramebuffer(U.READ_FRAMEBUFFER,null),S.bindFramebuffer(U.DRAW_FRAMEBUFFER,null)}else ye?A.isDataTexture||A.isData3DTexture?U.texSubImage3D(Et,wt,It,pe,ze,Ct,St,Rt,ve,$e,we.data):F.isCompressedArrayTexture?U.compressedTexSubImage3D(Et,wt,It,pe,ze,Ct,St,Rt,ve,we.data):U.texSubImage3D(Et,wt,It,pe,ze,Ct,St,Rt,ve,$e,we):A.isDataTexture?U.texSubImage2D(U.TEXTURE_2D,wt,It,pe,Ct,St,ve,$e,we.data):A.isCompressedTexture?U.compressedTexSubImage2D(U.TEXTURE_2D,wt,It,pe,we.width,we.height,ve,we.data):U.texSubImage2D(U.TEXTURE_2D,wt,It,pe,Ct,St,ve,$e,we);S.pixelStorei(U.UNPACK_ROW_LENGTH,an),S.pixelStorei(U.UNPACK_IMAGE_HEIGHT,oe),S.pixelStorei(U.UNPACK_SKIP_PIXELS,In),S.pixelStorei(U.UNPACK_SKIP_ROWS,jn),S.pixelStorei(U.UNPACK_SKIP_IMAGES,Ui),wt===0&&F.generateMipmaps&&U.generateMipmap(Et),S.unbindTexture()},this.initRenderTarget=function(A){q.get(A).__webglFramebuffer===void 0&&J.setupRenderTarget(A)},this.initTexture=function(A){A.isCubeTexture?J.setTextureCube(A,0):A.isData3DTexture?J.setTexture3D(A,0):A.isDataArrayTexture||A.isCompressedArrayTexture?J.setTexture2DArray(A,0):J.setTexture2D(A,0),S.unbindTexture()},this.resetState=function(){V=0,z=0,G=null,S.reset(),At.reset()},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}get coordinateSystem(){return En}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(t){this._outputColorSpace=t;const e=this.getContext();e.drawingBufferColorSpace=ae._getDrawingBufferColorSpace(t),e.unpackColorSpace=ae._getUnpackColorSpace()}}const d1=Object.freeze(Object.defineProperty({__proto__:null,ACESFilmicToneMapping:zl,AddEquation:xs,AddOperation:hp,AdditiveAnimationBlendMode:iu,AdditiveBlending:vh,AgXToneMapping:Zh,AlphaFormat:eu,AlwaysCompare:bp,AlwaysDepth:qo,AlwaysStencilFunc:_p,AmbientLight:pm,AnimationAction:wm,AnimationClip:Ca,AnimationLoader:lx,AnimationMixer:Bx,AnimationObjectGroup:Fx,AnimationUtils:nx,ArcCurve:zp,ArrayCamera:vm,ArrowHelper:ly,AttachedBindMode:bh,Audio:Sm,AudioAnalyser:Tx,AudioContext:Pu,AudioListener:bx,AudioLoader:yx,AxesHelper:cy,BackSide:nn,BasicDepthPacking:mp,BasicShadowMap:yg,BatchedMesh:uu,BezierInterpolant:lm,Bone:hu,BooleanKeyframeTrack:Ls,Box2:Tm,Box3:rn,Box3Helper:ay,BoxGeometry:Ni,BoxHelper:ry,BufferAttribute:ue,BufferGeometry:Zt,BufferGeometryLoader:xm,ByteType:Kh,Cache:ai,Camera:vc,CameraHelper:sy,CanvasTexture:M_,CapsuleGeometry:rc,CatmullRomCurve3:kp,CineonToneMapping:qh,CircleGeometry:Oa,ClampToEdgeWrapping:yn,Clock:Am,Color:ut,ColorKeyframeTrack:Au,ColorManagement:ae,Compatibility:o0,CompressedArrayTexture:y_,CompressedCubeTexture:v_,CompressedTexture:sc,CompressedTextureLoader:cx,ConeGeometry:Ba,ConstantAlphaFactor:op,ConstantColorFactor:rp,Controls:uy,CubeCamera:ym,CubeDepthTexture:Op,CubeReflectionMapping:li,CubeRefractionMapping:$i,CubeTexture:Fa,CubeTextureLoader:hx,CubeUVReflectionMapping:br,CubicBezierCurve:mu,CubicBezierCurve3:Vp,CubicInterpolant:am,CullFaceBack:yh,CullFaceFront:Wf,CullFaceFrontBack:xg,CullFaceNone:Hf,Curve:Kn,CurvePath:Hp,CustomBlending:Xf,CustomToneMapping:Yh,CylinderGeometry:Ar,Cylindrical:qx,Data3DTexture:Ql,DataArrayTexture:Kl,DataTexture:Nn,DataTextureLoader:ux,DataUtils:X0,DecrementStencilOp:Bg,DecrementWrapStencilOp:kg,DefaultLoadingManager:um,DepthFormat:ci,DepthStencilFormat:Xi,DepthTexture:xr,DetachedBindMode:up,DirectionalLight:Ru,DirectionalLightHelper:iy,DiscreteInterpolant:om,DodecahedronGeometry:ac,DoubleSide:Xn,DstAlphaFactor:tp,DstColorFactor:np,DynamicCopyUsage:e0,DynamicDrawUsage:$g,DynamicReadUsage:Qg,EdgesGeometry:Bp,EllipseCurve:oc,EqualCompare:vp,EqualDepth:Zo,EqualStencilFunc:Wg,EquirectangularReflectionMapping:na,EquirectangularRefractionMapping:ia,Euler:$n,EventDispatcher:Jn,ExternalTexture:fu,ExtrudeGeometry:lc,FileLoader:Li,Float16BufferAttribute:Q0,Float32BufferAttribute:Mt,FloatType:un,Fog:tc,FogExp2:Ua,FramebufferTexture:x_,FrontSide:Ii,Frustum:Es,FrustumArray:ic,GLBufferAttribute:Hx,GLSL1:i0,GLSL3:Ah,GreaterCompare:Mp,GreaterDepth:Jo,GreaterEqualCompare:$l,GreaterEqualDepth:$o,GreaterEqualStencilFunc:Zg,GreaterStencilFunc:qg,GridHelper:ey,Group:vn,HTMLTexture:S_,HalfFloatType:Zn,HemisphereLight:Cu,HemisphereLightHelper:ty,IcosahedronGeometry:cc,ImageBitmapLoader:xx,ImageLoader:Ra,ImageUtils:Ep,IncrementStencilOp:Og,IncrementWrapStencilOp:zg,InstancedBufferAttribute:_r,InstancedBufferGeometry:_m,InstancedInterleavedBuffer:Gx,InstancedMesh:Dp,Int16BufferAttribute:J0,Int32BufferAttribute:K0,Int8BufferAttribute:Y0,IntType:Vl,InterleavedBuffer:ec,InterleavedBufferAttribute:Ts,Interpolant:Er,InterpolateBezier:wh,InterpolateDiscrete:xa,InterpolateLinear:Cl,InterpolateSmooth:Vo,InterpolationSamplingMode:a0,InterpolationSamplingType:r0,InvertStencilOp:Vg,KeepStencilOp:Go,KeyframeTrack:On,LOD:Pp,LatheGeometry:hc,Layers:jl,LessCompare:yp,LessDepth:Yo,LessEqualCompare:Zl,LessEqualDepth:fr,LessEqualStencilFunc:Xg,LessStencilFunc:Hg,Light:ns,LightProbe:gm,LightShadow:yc,Line:Qi,Line3:$x,LineBasicMaterial:pn,LineCurve:gu,LineCurve3:Gp,LineDashedMaterial:im,LineLoop:Np,LineSegments:di,LinearFilter:Ae,LinearInterpolant:wu,LinearMipMapLinearFilter:wg,LinearMipMapNearestFilter:bg,LinearMipmapLinearFilter:ri,LinearMipmapNearestFilter:sa,LinearSRGBColorSpace:va,LinearToneMapping:Wh,LinearTransfer:Ma,Loader:Sn,LoaderUtils:Ih,LoadingManager:Eu,LoopOnce:dp,LoopPingPong:pp,LoopRepeat:fp,MOUSE:gg,Material:Ze,MaterialBlending:vg,MaterialLoader:Mc,MathUtils:An,Matrix2:Lh,Matrix3:Jt,Matrix4:Yt,MaxEquation:$f,Mesh:be,MeshBasicMaterial:hi,MeshDepthMaterial:Su,MeshDistanceMaterial:bu,MeshLambertMaterial:es,MeshMatcapMaterial:nm,MeshNormalMaterial:em,MeshPhongMaterial:jp,MeshPhysicalMaterial:Qp,MeshStandardMaterial:Mu,MeshToonMaterial:tm,MinEquation:Zf,MirroredRepeatWrapping:ma,MixOperation:cp,MultiplyBlending:Sh,MultiplyOperation:Da,NearestFilter:Be,NearestMipMapLinearFilter:Sg,NearestMipMapNearestFilter:Mg,NearestMipmapLinearFilter:rr,NearestMipmapNearestFilter:Jh,NeutralToneMapping:$h,NeverCompare:xp,NeverDepth:Xo,NeverStencilFunc:Gg,NoBlending:oi,NoColorSpace:Si,NoNormalPacking:Lg,NoToneMapping:Yn,NormalAnimationBlendMode:Yl,NormalBlending:cr,NormalGAPacking:Ng,NormalRGPacking:Dg,NotEqualCompare:Sp,NotEqualDepth:Ko,NotEqualStencilFunc:Yg,NumberKeyframeTrack:_c,Object3D:he,ObjectLoader:gx,ObjectSpaceNormalMap:gp,OctahedronGeometry:ka,OneFactor:Kf,OneMinusConstantAlphaFactor:lp,OneMinusConstantColorFactor:ap,OneMinusDstAlphaFactor:ep,OneMinusDstColorFactor:ip,OneMinusSrcAlphaFactor:Hh,OneMinusSrcColorFactor:jf,OrthographicCamera:Va,PCFShadowMap:ea,PCFSoftShadowMap:Vh,PMREMGenerator:Nh,Path:wa,PerspectiveCamera:Xe,Plane:Mi,PlaneGeometry:Ps,PlaneHelper:oy,PointLight:fm,PointLightHelper:Qx,Points:Up,PointsMaterial:du,PolarGridHelper:ny,PolyhedronGeometry:ts,PositionalAudio:Ax,PropertyBinding:le,PropertyMixer:bm,QuadraticBezierCurve:_u,QuadraticBezierCurve3:xu,Quaternion:sn,QuaternionKeyframeTrack:xc,QuaternionLinearInterpolant:hm,R11_EAC_Format:rl,RED_GREEN_RGTC2_Format:_a,RED_RGTC1_Format:Al,REVISION:Bl,RG11_EAC_Format:ga,RGBADepthPacking:Rg,RGBAFormat:dn,RGBAIntegerFormat:ql,RGBA_ASTC_10x10_Format:yl,RGBA_ASTC_10x5_Format:gl,RGBA_ASTC_10x6_Format:_l,RGBA_ASTC_10x8_Format:xl,RGBA_ASTC_12x10_Format:vl,RGBA_ASTC_12x12_Format:Ml,RGBA_ASTC_4x4_Format:ll,RGBA_ASTC_5x4_Format:cl,RGBA_ASTC_5x5_Format:hl,RGBA_ASTC_6x5_Format:ul,RGBA_ASTC_6x6_Format:dl,RGBA_ASTC_8x5_Format:fl,RGBA_ASTC_8x6_Format:pl,RGBA_ASTC_8x8_Format:ml,RGBA_BPTC_Format:Sl,RGBA_ETC2_EAC_Format:sl,RGBA_PVRTC_2BPPV1_Format:el,RGBA_PVRTC_4BPPV1_Format:tl,RGBA_S3TC_DXT1_Format:aa,RGBA_S3TC_DXT3_Format:oa,RGBA_S3TC_DXT5_Format:la,RGBDepthPacking:Ig,RGBFormat:nu,RGBIntegerFormat:Ag,RGB_BPTC_SIGNED_Format:bl,RGB_BPTC_UNSIGNED_Format:wl,RGB_ETC1_Format:nl,RGB_ETC2_Format:il,RGB_PVRTC_2BPPV1_Format:jo,RGB_PVRTC_4BPPV1_Format:Qo,RGB_S3TC_DXT1_Format:ra,RGDepthPacking:Pg,RGFormat:Ji,RGIntegerFormat:Xl,RawShaderMaterial:vu,Ray:wr,Raycaster:Wx,RectAreaLight:mm,RedFormat:Wl,RedIntegerFormat:Na,ReinhardToneMapping:Xh,RenderObjectRefreshType:l0,RenderTarget:ru,RenderTarget3D:zx,RepeatWrapping:pa,ReplaceStencilOp:Fg,ReverseSubtractEquation:Yf,RingGeometry:uc,SIGNED_R11_EAC_Format:al,SIGNED_RED_GREEN_RGTC2_Format:El,SIGNED_RED_RGTC1_Format:Tl,SIGNED_RG11_EAC_Format:ol,SRGBColorSpace:cn,SRGBTransfer:me,Scene:au,ShaderChunk:ee,ShaderLib:Hn,ShaderMaterial:Fn,ShadowMaterial:$p,Shape:za,ShapeGeometry:dc,ShapePath:hy,ShapeUtils:qn,ShortType:Qh,Skeleton:nc,SkeletonHelper:Kx,SkinnedMesh:Lp,Source:D0,Sphere:Ye,SphereGeometry:Tr,Spherical:Xx,SphericalHarmonics3:Iu,SplineCurve:yu,SpotLight:dm,SpotLightHelper:Jx,Sprite:Ip,SpriteMaterial:cu,SrcAlphaFactor:Gh,SrcAlphaSaturateFactor:sp,SrcColorFactor:Qf,StaticCopyUsage:t0,StaticDrawUsage:Jl,StaticReadUsage:Kg,StereoCamera:vx,StreamCopyUsage:n0,StreamDrawUsage:Jg,StreamReadUsage:jg,StringKeyframeTrack:Ds,SubtractEquation:qf,SubtractiveBlending:Mh,TOUCH:_g,TangentSpaceNormalMap:Pi,TetrahedronGeometry:fc,Texture:Ce,TextureLoader:dx,TextureSource:Ai,TextureUtils:gy,Timer:Mm,TimestampQuery:s0,TorusGeometry:pc,TorusKnotGeometry:mc,Triangle:xn,TriangleFanDrawMode:Cg,TriangleStripDrawMode:Eg,TrianglesDrawMode:Tg,TubeGeometry:gc,UVMapping:kl,Uint16BufferAttribute:ou,Uint32BufferAttribute:lu,Uint8BufferAttribute:Z0,Uint8ClampedBufferAttribute:$0,Uniform:Nu,UniformsGroup:Vx,UniformsLib:yt,UniformsUtils:Kp,UnsignedByteType:_n,UnsignedInt101111Type:tu,UnsignedInt248Type:mr,UnsignedInt5999Type:jh,UnsignedIntType:Un,UnsignedShort4444Type:Gl,UnsignedShort5551Type:Hl,UnsignedShortType:pr,VSMShadowMap:sr,Vector2:it,Vector3:I,Vector4:xe,VectorKeyframeTrack:Tu,VideoFrameTexture:__,VideoTexture:Fp,WebGL3DRenderTarget:F0,WebGLArrayRenderTarget:U0,WebGLCoordinateSystem:En,WebGLCubeRenderTarget:Uu,WebGLRenderTarget:Mn,WebGLRenderer:Fm,WebGLUtils:Nm,WebGPUCoordinateSystem:As,WebXRController:Ho,WireframeGeometry:Zp,WrapAroundEnding:ya,ZeroCurvatureEnding:ys,ZeroFactor:Jf,ZeroSlopeEnding:vs,ZeroStencilOp:Ug,createCanvasElement:Ap,error:Nt,getConsoleFunction:d0,log:ba,setConsoleFunction:u0,warn:pt,warnOnce:Ci},Symbol.toStringTag,{value:"Module"})),Rs=2048,Te=Rs/2,zt=32,Is=Rs/zt,ce=-16,Ti=112,bs=Ti-ce,Oe=0,Fu=1,f1=zt*zt*bs,Oh=zt*zt,Pt={AIR:0,GRASS:1,SOIL:2,SAND:3,GRAVEL:4,STONE:5,ORE:6,WATER:7,BEDROCK:8,MOSS:9},Ll=s=>s!==Pt.AIR&&s!==Pt.WATER,Ff=Ll,Ln=(s,t,e)=>s<t?t:s>e?e:s,Fo=(s,t,e)=>s+(t-s)*e,Wi=(s,t,e)=>{const n=Ln((e-s)/(t-s),0,1);return n*n*(3-2*n)};function Ei(s,t,e){let n=e^Math.imul(s,374761393)^Math.imul(t,668265263);return n=Math.imul(n^n>>>13,1274126177),((n^n>>>16)>>>0)/4294967296}function yi(s,t,e,n){let i=n^Math.imul(s,374761393)^Math.imul(t,668265263)^Math.imul(e,2246822519);return i=Math.imul(i^i>>>13,1274126177),((i^i>>>16)>>>0)/4294967296}function wc(s){let t=s>>>0;return()=>{t=t+1831565813>>>0;let e=t;return e=Math.imul(e^e>>>15,e|1),e^=e+Math.imul(e^e>>>7,e|61),((e^e>>>14)>>>0)/4294967296}}const fa=s=>s*s*(3-2*s);function p1(s,t,e){const n=Math.floor(s),i=Math.floor(t),r=fa(s-n),a=fa(t-i),o=Ei(n,i,e),l=Ei(n+1,i,e),c=Ei(n,i+1,e),h=Ei(n+1,i+1,e),f=o+(l-o)*r,u=c+(h-c)*r;return f+(u-f)*a}function _e(s,t,e,n){let i=0,r=1,a=1,o=0;for(let l=0;l<n;l++)i+=r*p1(s*a,t*a,e+l*131),o+=r,r*=.5,a*=2;return i/o}function Dl(s,t,e,n){const i=Math.floor(s),r=Math.floor(t),a=Math.floor(e),o=fa(s-i),l=fa(t-r),c=fa(e-a),h=yi(i,r,a,n),f=yi(i+1,r,a,n),u=yi(i,r+1,a,n),d=yi(i+1,r+1,a,n),p=yi(i,r,a+1,n),_=yi(i+1,r,a+1,n),g=yi(i,r+1,a+1,n),m=yi(i+1,r+1,a+1,n),x=h+(f-h)*o,M=u+(d-u)*o,y=p+(_-p)*o,w=g+(m-g)*o,b=x+(M-x)*l,E=y+(w-y)*l;return b+(E-b)*c}function m1(s,t,e,n,i){let r=0,a=1,o=1,l=0;for(let c=0;c<i;c++)r+=a*Dl(s*o,t*o,e*o,n+c*131),l+=a,a*=.5,o*=2;return r/l}const g1={size:Rs,chunkSize:zt,yMin:ce,yMax:Ti,seaLevel:Oe,generatorVersion:Fu},ur=(s,t)=>`${s},${t}`,Ia=s=>s*zt-Te,Pa=s=>s*zt-Te,si=(s,t,e)=>s+e*zt+t*Oh,qi=s=>Math.floor((s+Te)/zt),Yi=s=>Math.floor((s+Te)/zt),Nl=s=>s-(qi(s)*zt-Te),Ul=s=>s-(Yi(s)*zt-Te),wi=s=>s-ce;function _1(s=1337){return{seed:s,params:{...g1},chunks:new Map,entities:new Map,entityChunks:new Map,sites:[],regions:y1,edits:new Map,inventory:{},dirty:new Set,stats:{chunksGenerated:0,chunksEvicted:0,voxelsFilled:0,generationMs:0,entities:0,trees:0,pinkTrees:0,pinkOverflow:0},authoredPlaced:!1}}function x1(s=1337,t=0){const e=_1(s),n=Math.floor(Is/2);for(let i=n-t;i<=n+t;i++)for(let r=n-t;r<=n+t;r++)zm(e,r,i);return D1(e),e}const y1=[{id:"founder",label:"Founder valley",type:"plain",cx:0,cz:0,rx:110,rz:85},{id:"eastwood",label:"Eastwood",type:"forest",cx:220,cz:-110,rx:260,rz:220},{id:"crown",label:"Crown highlands",type:"highland",cx:-360,cz:-300,rx:380,rz:300},{id:"lake",label:"Mirror lake",type:"water",cx:-260,cz:-230,rx:120,rz:95},{id:"southdowns",label:"South downs",type:"hills",cx:120,cz:330,rx:260,rz:190},{id:"westrise",label:"West rise",type:"hills",cx:-360,cz:120,rx:220,rz:210},{id:"coast",label:"Broken coast",type:"ridge",cx:0,cz:0,rx:780,rz:660}];function v1(s){return-90+55*Math.sin((s+100)/240)+18*Math.sin((s-20)/80)}function Om(s,t){return Math.abs(s-v1(t))}function M1(s,t){return Math.sqrt(((s+260)/120)**2+((t+230)/95)**2)}function Ms(s,t,e){const n=t+(_e(t/420,e/420,s+101,3)-.5)*240+(_e(t/95,e/95,s+102,2)-.5)*30,i=e+(_e(t/420+7.3,e/420-3.1,s+103,3)-.5)*240+(_e(t/95+3.7,e/95-8.1,s+104,2)-.5)*30,r=Math.sqrt((n/780)**2+(i/660)**2),a=(_e(n/300,i/300,s+105,4)-.5)*.34+(_e(n/95,i/95,s+106,2)-.5)*.1,o=1-r+a,l=Wi(-.03,.12,o),c=-13+6*_e(n/170,i/170,s+107,3),h=4+11*_e(n/340,i/340,s+108,4),f=8*_e(n/115,i/115,s+109,3),u=2.2*_e(t/42,e/42,s+110,2)+.9*_e(t/15,e/15,s+111,2),d=_e(n/480+11,i/480-7,s+112,4),p=Wi(.6,.78,d),_=1-Math.abs(2*_e(n/230,i/230,s+113,4)-1),g=1-Math.abs(2*_e(n/90,i/90,s+114,3)-1),m=Math.exp(-(((n+360)/380)**2+((i+300)/320)**2)),x=Math.min(1,p*(.3+.7*m)+.22*m);let M=h+f+u+x*(20+40*_*_+12*g);const y=1-Math.abs(2*_e(n/85,i/85,s+120,3)-1),w=Math.pow(1-Math.abs(2*_e(n/52+13,i/52-5,s+121,3)-1),2);M+=(y-.55)*5-w*3.2,M=c+(M-c)*l,M+=1.6*Wi(0,.1,o);const b=Om(n,i),E=Wi(95,10,b)*Wi(0,.1,o),v=2.5+1*_e(n/60,i/60,s+115,2);M=Fo(M,v,E*.75);const T=5+3*_e(n/45,i/45,s+116,2),C=Wi(T+18,T*.4,b);o>0&&(M=Fo(M,-2,C*.95));const P=M1(n,i)*(1+.18*(_e(n/90,i/90,s+117,2)-.5)*2);if(P<1.15){const D=Wi(1.15,.55,P);M=Fo(M,-6.5,D*.95)}const L=Math.sqrt(((t+8)/62)**2+((e-4)/48)**2)+(_e(t/45,e/45,s+118,2)-.5)*.55,N=Wi(1.05,.55,L);if(N>0){const D=13+1.2*_e(t/36,e/36,s+119,2)+t*.01;M=Fo(M,D,N*.78)}return Math.round(Ln(M,-14,92))}function Bm(s,t,e,n,i,r){return Om(t,e)<12&&n<Oe+1?Pt.GRAVEL:n<=Oe+.5||(r===void 0&&(r=Ms(s,t-3,e)<Oe+1||Ms(s,t+3,e)<Oe+1||Ms(s,t,e-3)<Oe+1||Ms(s,t,e+3)<Oe+1),r&&n<=Oe+1.5)?Pt.SAND:i>=3||n>58&&_e(t/18,e/18,s+120,2)>.45||n>48&&i>=2||n>40&&i>=2&&_e(t/12,e/12,s+121,2)>.55?Pt.STONE:Pt.GRASS}function S1(s,t,e,n,i,r){return Bm(s,t,e,n,i,r)}function b1(s){return s===Pt.GRASS||s===Pt.MOSS?Pt.SOIL:s===Pt.SAND?Pt.SAND:s===Pt.GRAVEL?Pt.GRAVEL:Pt.STONE}function w1(s,t,e,n){if(_e(t/55,n/55,s+130,2)<.57)return!1;const r=Dl(t*.09,e*.13,n*.09,s+131),a=Dl(t*.22+5,e*.31,n*.22-3,s+132);return r>.7&&a>.5}function A1(s,t,e,n){return m1(t*.075,e*.11,n*.075,s+140,2)>.72}function T1(s,t,e,n){return Dl(t*.18,e*.22,n*.18,s+141)>.62}function La(s,t,e){if(t<0||e<0||t>=Is||e>=Is)return null;const n=ur(t,e),i=s.chunks.get(n);return i||zm(s,t,e)}function zm(s,t,e){if(t<0||e<0||t>=Is||e>=Is)return null;const n=ur(t,e),i=s.chunks.get(n);if(i)return i;const r=performance.now(),a=new Uint8Array(f1),o=new Uint8Array(Oh),l=new Uint8Array(Oh),c=Ia(t),h=Pa(e),f=s.seed,u=3,d=zt+u*2,p=new Int16Array(d*d);for(let x=0;x<d;x++)for(let M=0;M<d;M++)p[x*d+M]=Ms(f,c+M-u,h+x-u);let _=0;for(let x=0;x<zt;x++)for(let M=0;M<zt;M++){const y=c+M,w=h+x,b=p[(x+u)*d+(M+u)],E=Math.max(Math.abs(b-p[(x+u)*d+(M+u-1)]),Math.abs(b-p[(x+u)*d+(M+u+1)]),Math.abs(b-p[(x+u-1)*d+(M+u)]),Math.abs(b-p[(x+u+1)*d+(M+u)])),v=p[(x+u)*d+(M+u-3)]<Oe+1||p[(x+u)*d+(M+u+3)]<Oe+1||p[(x+u-3)*d+(M+u)]<Oe+1||p[(x+u+3)*d+(M+u)]<Oe+1,T=Bm(f,y,w,b,E,v),C=b1(T),P=_e(y/55,w/55,f+130,2)>.57,L=x*zt+M,N=ce,D=Math.min(Ti-1,b-1);for(let V=N;V<=D;V++){const z=b-1-V;let G;V===ce?G=Pt.BEDROCK:z===0?G=T:z<=2?G=C:G=Pt.STONE,G===Pt.STONE&&z>4&&P&&w1(f,y,V,w)&&(G=Pt.ORE),z<=2&&E>=2&&T1(f,y,V,w)&&(G=Pt.AIR),G!==Pt.AIR&&z>7&&z<24&&A1(f,y,V,w)&&(G=Pt.AIR),G!==Pt.AIR&&(a[si(M,wi(V),x)]=G,_++)}if(b<Oe)for(let V=Math.max(ce,b);V<Oe;V++){const z=si(M,wi(V),x);a[z]===Pt.AIR&&(a[z]=Pt.WATER,_++)}const O=Math.min(Ti-1,Math.max(ce,b-1));o[L]=Ln(O-ce,0,bs-1),l[L]=T}for(let x=0;x<zt;x++)for(let M=0;M<zt;M++){const y=p[(x+u)*d+(M+u)];if(Math.max(Math.abs(y-p[(x+u)*d+(M+u-1)]),Math.abs(y-p[(x+u)*d+(M+u+1)]),Math.abs(y-p[(x+u-1)*d+(M+u)]),Math.abs(y-p[(x+u+1)*d+(M+u)]))<2)continue;const b=[[-1,0],[1,0],[0,-1],[0,1]];for(const[E,v]of b){const T=M+E,C=x+v;if(T<0||C<0||T>=zt||C>=zt)continue;const P=p[(C+u)*d+(T+u)];if(y-P<2||yi(M,x,E*3+v*7,f+150)<.55)continue;const L=y-2;if(L<ce||L>=y)continue;const N=si(T,wi(L),C);a[N]===Pt.AIR&&(a[N]=Pt.STONE,_++)}}for(let x=0;x<zt;x++)for(let M=0;M<zt;M++){let y=ce,w=l[x*zt+M];for(let b=Ti-1;b>=ce;b--){const E=a[si(M,wi(b),x)];if(Ll(E)){y=b,w=E;break}}o[x*zt+M]=Ln(y-ce,0,bs-1),l[x*zt+M]=w}const g={cx:t,cz:e,key:n,data:a,heights:o,topMaterials:l,nonAir:_,dirty:!0,generatedAt:performance.now()},m=s.edits.get(n);if(m){for(const[x,M]of m)g.data[x]=M;for(let x=0;x<zt;x++)for(let M=0;M<zt;M++){let y=ce,w=g.topMaterials[x*zt+M];for(let b=Ti-1;b>=ce;b--){const E=g.data[si(M,wi(b),x)];if(Ll(E)){y=b,w=E;break}}g.heights[x*zt+M]=Ln(y-ce,0,bs-1),g.topMaterials[x*zt+M]=w}}return s.chunks.set(n,g),s.stats.chunksGenerated++,s.stats.voxelsFilled+=_,s.stats.generationMs+=performance.now()-r,s.dirty.add(n),L1(s,g),g}function E1(s,t){return s.chunks.has(t)?(s.chunks.delete(t),s.stats.chunksEvicted++,!0):!1}function C1(s,t,e,n){if(e<ce)return Pt.BEDROCK;if(e>=Ti||t<-Te||n<-Te||t>=Te||n>=Te)return Pt.AIR;const i=qi(t),r=Yi(n),a=La(s,i,r);return a?a.data[si(Nl(t),wi(e),Ul(n))]:Pt.AIR}function km(s,t,e,n,i){if(e<ce||e>=Ti||t<-Te||n<-Te||t>=Te||n>=Te)return!1;const r=qi(t),a=Yi(n),o=La(s,r,a);if(!o)return!1;const l=si(Nl(t),wi(e),Ul(n));if(o.data[l]===i)return!1;o.data[l]=i;let c=s.edits.get(o.key);return c||(c=new Map,s.edits.set(o.key,c)),c.set(l,i),o.dirty=!0,s.dirty.add(o.key),R1(o,Nl(t),Ul(n)),!0}function R1(s,t,e){let n=ce;for(let r=Ti-1;r>=ce;r--)if(Ll(s.data[si(t,wi(r),e)])){n=r;break}s.heights[e*zt+t]=Ln(n-ce,0,bs-1);const i=s.topMaterials[e*zt+t];if(n>=ce){const r=s.data[si(t,wi(n),e)];r!==Pt.WATER&&(s.topMaterials[e*zt+t]=r)}else s.topMaterials[e*zt+t]=i}function Rr(s,t,e){if(t<-Te||e<-Te||t>=Te||e>=Te)return ce;const n=qi(t),i=Yi(e),r=La(s,n,i);return r?r.heights[Ul(e)*zt+Nl(t)]+ce+1:ce}function Qr(s,t){if(s.entities.has(t.id))return;s.entities.set(t.id,t);let e=s.entityChunks.get(t.chunk);e||(e=[],s.entityChunks.set(t.chunk,e)),e.push(t.id),s.stats.entities=s.entities.size}function Oo(s,t){return`e:${s}:${t}`}function I1(s,t,e){const n=Math.exp(-(((s-220)/260)**2+((t+110)/220)**2)),i=Math.exp(-(((s-20)/300)**2+((t+300)/190)**2)),r=Math.exp(-(((s+340)/200)**2+((t-120)/180)**2)),a=Math.exp(-(((s-120)/240)**2+((t-330)/180)**2)),o=_e(s/260,t/260,e+201,4),l=Math.exp(-((s/140)**2+(t/105)**2));return Math.max(n,i*.92,r*.8,a*.78)*.82+o*.38-.22-l*.34}function P1(s,t,e){const n=_e(s/330,t/330,e+202,3),i=1-Math.abs(2*_e(s/140,t/140,e+203,3)-1);return n*.55+i*.45}function L1(s,t){if(s.entityChunks.has(t.key))return;const e=wc(Ei(t.cx,t.cz,s.seed+900)*4294967296>>>0),n=Ia(t.cx),i=Pa(t.cz);let r=0;const a=(c,h)=>t.heights[h*zt+c]+ce+1,o=(c,h)=>t.topMaterials[h*zt+c],l=(c,h)=>{const f=a(c,h);return Math.max(Math.abs(f-a(Ln(c-1,0,zt-1),h)),Math.abs(f-a(Ln(c+1,0,zt-1),h)),Math.abs(f-a(c,Ln(h-1,0,zt-1))),Math.abs(f-a(c,Ln(h+1,0,zt-1))))};for(let c=0;c<zt;c+=8)for(let h=0;h<zt;h+=8){const f=Ln(Math.floor(h+2+(e()-.5)*5),1,zt-2),u=Ln(Math.floor(c+2+(e()-.5)*5),1,zt-2),d=n+f,p=i+u,_=a(f,u);if(_<=Oe+1)continue;const g=l(f,u),m=o(f,u);if(m===Pt.WATER)continue;const x=I1(d,p,s.seed),M=P1(d,p,s.seed),y=e(),w=x>.5?.72:x>.3?.25:.05;if(m===Pt.GRASS&&g<=2&&y<w){let b,E;const v=e();v<.12?s.stats.pinkTrees+1>.25*(s.stats.trees+1)?(b="styl_tree_cluster",E=Math.floor(e()*3),s.stats.pinkOverflow++):(b="styl_tree_blossom",E=Math.floor(e()*2),s.stats.pinkTrees++):v<.4?(b="styl_tree_spire",E=Math.floor(e()*4)):v<.74?(b="styl_tree_table",E=Math.floor(e()*4)):(b="styl_tree_cluster",E=Math.floor(e()*3)),s.stats.trees++,Qr(s,{id:Oo(t.key,r++),kind:b,chunk:t.key,x:d+.5,y:_,z:p+.5,rot:Math.floor(e()*24)*(Math.PI/12),scale:.88+e()*.24,variant:E,resource:"wood",remaining:12,yieldPerHarvest:4,harvested:!1,provisional:!0,authored:!1});continue}if(m===Pt.GRASS&&M>.46&&y<.38){const b=e(),E=b<.55?"styl_rock_small":b<.9?"styl_rock_medium":"styl_rock_large",v=E==="styl_rock_small"?4:E==="styl_rock_medium"?8:12;Qr(s,{id:Oo(t.key,r++),kind:E,chunk:t.key,x:d+.5,y:_,z:p+.5,rot:Math.floor(e()*24)*(Math.PI/12),scale:.9+e()*.2,variant:Math.floor(e()*3),resource:"stone",remaining:v,yieldPerHarvest:3,harvested:!1,provisional:!0,authored:!1});continue}if(m===Pt.STONE&&M>.58&&y<.18){Qr(s,{id:Oo(t.key,r++),kind:"styl_ore",chunk:t.key,x:d+.5,y:_,z:p+.5,rot:Math.floor(e()*24)*(Math.PI/12),scale:.9+e()*.2,variant:Math.floor(e()*2),resource:"ore",remaining:8,yieldPerHarvest:2,harvested:!1,provisional:!0,authored:!1});continue}m===Pt.GRASS&&g<=1&&y<.3&&Qr(s,{id:Oo(t.key,r++),kind:"styl_shrub",chunk:t.key,x:d+.5,y:_,z:p+.5,rot:Math.floor(e()*24)*(Math.PI/12),scale:.8+e()*.4,variant:Math.floor(e()*3),resource:"fiber",remaining:4,yieldPerHarvest:1,harvested:!1,provisional:!0,authored:!1})}}function Wr(s,t,e,n,i,r,a,o,l,c){const h=Rr(s,e,n);if(h<=Oe)return;const f=qi(e),u=Yi(n),d=ur(f,u),p=s.entityChunks.get(d)??[];for(const m of p){const x=s.entities.get(m);x&&Math.hypot(x.x-e,x.z-n)<2.6&&(s.entities.delete(m),x.kind.startsWith("styl_tree")&&(s.stats.trees=Math.max(0,s.stats.trees-1)),x.kind==="styl_tree_blossom"&&(s.stats.pinkTrees=Math.max(0,s.stats.pinkTrees-1)))}s.entityChunks.set(d,p.filter(m=>s.entities.has(m)));const _=`hero:${t}:${Math.round(e)}:${Math.round(n)}`,g=s.entities.size;Qr(s,{id:_,kind:t,chunk:d,x:e+.5,y:h,z:n+.5,rot:r,scale:a,variant:i,resource:o,remaining:l,yieldPerHarvest:c,harvested:!1,provisional:!0,authored:!0}),s.entities.size>g&&t.startsWith("styl_tree")&&(s.stats.trees++,t==="styl_tree_blossom"&&s.stats.pinkTrees++)}function D1(s){if(s.authoredPlaced)return;s.authoredPlaced=!0;const t=[{kind:"waystone",x:-10,z:-14,rot:0},{kind:"marker",x:-32,z:-8,rot:Math.PI/2}];for(const n of t){const i=Rr(s,n.x,n.z);i<=Oe||s.sites.push({id:`site:${n.kind}`,kind:n.kind,x:n.x+.5,y:i,z:n.z+.5,rot:n.rot,provisional:!0})}const e=[["styl_tree_spire",-22,-26,0,1,0],["styl_tree_table",-34,-18,1,.95,Math.PI/12],["styl_tree_cluster",-16,-34,2,1,Math.PI/6],["styl_tree_blossom",-28,-38,0,.9,Math.PI/4],["styl_tree_table",-40,-30,2,1.05,Math.PI/3],["styl_tree_cluster",-12,-24,0,.9,Math.PI/2.4]];for(const[n,i,r,a,o,l]of e)Wr(s,n,i,r,a,l,o,"wood",12,4);Wr(s,"styl_rock_medium",-6,-10,0,0,1,"stone",8,3),Wr(s,"styl_shrub",-14,-8,1,Math.PI/12,1.1,"fiber",4,1),Wr(s,"styl_cairn",-20,-6,0,0,1,"stone",6,2),Wr(s,"styl_ore",-38,-42,0,Math.PI/4,1.1,"ore",8,2)}function N1(s,t,e,n,i){let r=null,a=n*n;for(const o of s.entities.values()){if(o.harvested||!o.resource||o.remaining<=0||o.resource!==i)continue;const l=(o.x-t)**2+(o.z-e)**2;l<a&&(a=l,r=o)}return r}function U1(s,t){const e=s.entities.get(t);if(!e||e.harvested||!e.resource||e.remaining<=0)return null;const n=Math.min(e.yieldPerHarvest,e.remaining);return e.remaining-=n,e.harvestedOnce=!0,e.remaining<=0&&(e.harvested=!0),s.inventory[e.resource]=(s.inventory[e.resource]??0)+n,{entity:e,resource:e.resource,amount:n}}function F1(s,t){s.paused||(s.t=(s.t+t/s.dayLengthSec)%1)}const O1={grass_top:{hex:"#79B94C",role:"terrain top, low elevation"},grass_high:{hex:"#8FC95E",role:"terrain top, mid elevation"},grass_peak:{hex:"#9AD06A",role:"terrain top, high elevation"},grass_cap:{hex:"#5E9440",role:"side band 0.0-0.4 m below top"},strata_ochre:{hex:"#C99A5F",role:"side band 0.4-0.62 m below top"},strata_rust:{hex:"#B4633C",role:"side band 0.62-0.80 m below top"},stone_top:{hex:"#E6DFCC",role:"bare stone top surface"},stone_body_a:{hex:"#DCD3BE",role:"side body, even 4.5 m band"},stone_body_b:{hex:"#D1C7AF",role:"side body, odd 4.5 m band"},stone_shade:{hex:"#B9AE96",role:"crevice / recessed stone accent"},sand:{hex:"#E3D3A6",role:"shore cells"},water_shallow:{hex:"#67CFD8",role:"water depth <= 0.5 m"},water_mid:{hex:"#3AAFC4",role:"water depth ~1.5 m"},water_deep:{hex:"#2A8FA8",role:"water depth >= 4.0 m"},water_rim:{hex:"#BFEAF0",role:"shoreline rim / foam tint"},canopy_green_a:{hex:"#5FA83F",role:"green canopy, shade mass"},canopy_green_b:{hex:"#6FB84A",role:"green canopy, main mass"},canopy_green_c:{hex:"#7FC356",role:"green canopy, highlight mass"},canopy_pink:{hex:"#F2A6C4",role:"blossom accent species only"},canopy_pink_b:{hex:"#E88FB2",role:"blossom shade mass"},trunk:{hex:"#6B4A33",role:"tree trunks"},bark_dark:{hex:"#4E3626",role:"trunk shade, stumps"},ore_crystal:{hex:"#7B5AD6",role:"ore deposit accent (proposed, replaces teal)"},ore_crystal_b:{hex:"#9B7BE8",role:"ore highlight facet"},noxel_stone:{hex:"#E6DFCC",role:"Noxel architecture main stone"},noxel_stone_b:{hex:"#D3C9B4",role:"Noxel secondary stone / recess"},accent_blue:{hex:"#3E7FB8",role:"banner / cloth accent"},accent_teal:{hex:"#2FA6A0",role:"secondary accent"},emissive_fire:{hex:"#FF9E4A",role:"campfire / warm emissive (effects only)"},emissive_magic:{hex:"#D24BFF",role:"reserved: magic effects only, never materials"}},B1={dawn:{sunElevationDeg:12,sunAzimuthDeg:105,sunColor:"#FFC79A",sunIntensity:2.2,hemiSky:"#8FA6C8",hemiGround:"#4E5F6E",hemiIntensity:.6,sky:"#A8BED6",fog:"#A8BED6",fogDensity:.005,exposure:1.1},noon:{sunElevationDeg:38,sunAzimuthDeg:50,sunColor:"#FFF4DC",sunIntensity:2.75,hemiSky:"#BFD9F2",hemiGround:"#7A8F55",hemiIntensity:.55,sky:"#9ED2EE",fog:"#DCEFF8",fogDensity:.0028,exposure:1.05},dusk:{sunElevationDeg:9,sunAzimuthDeg:250,sunColor:"#FFB27A",sunIntensity:3.2,hemiSky:"#8E7C9E",hemiGround:"#5A4A50",hemiIntensity:1.1,sky:"#C98E86",fog:"#C0908A",fogDensity:.0036,exposure:1.32},night:{sunElevationDeg:40,sunAzimuthDeg:220,sunColor:"#AFC8FF",sunIntensity:1,hemiSky:"#3A4C7A",hemiGround:"#1C2540",hemiIntensity:1.05,sky:"#101736",fog:"#151C3C",fogDensity:.0045,exposure:1.5}},Ac={materials:O1,lighting:B1},z1=Ac.materials,Ne=s=>z1[s].hex,Of=new Map;function Ue(s){let t=Of.get(s);return t||(t=new ut(s),Of.set(s,t)),t}const re={grassTop:[Ue(Ne("grass_top")),Ue(Ne("grass_high")),Ue(Ne("grass_peak"))],grassCap:Ue(Ne("grass_cap")),soil:Ue(Ne("strata_ochre")).clone().multiplyScalar(.78),ochre:Ue(Ne("strata_ochre")),rust:Ue(Ne("strata_rust")),stoneTop:Ue(Ne("stone_top")),stoneA:Ue(Ne("stone_body_a")),stoneB:Ue(Ne("stone_body_b")),stoneShade:Ue(Ne("stone_shade")),sand:Ue(Ne("sand")),gravel:Ue(Ne("stone_body_b")).clone().lerp(Ue(Ne("sand")),.35),ore:Ue(Ne("ore_crystal")),moss:Ue(Ne("grass_cap")).clone().lerp(Ue(Ne("stone_body_b")),.35),waterRim:Ue(Ne("water_rim")),waterShallow:Ue(Ne("water_shallow")),waterMid:Ue(Ne("water_mid")),waterDeep:Ue(Ne("water_deep"))},k1=[.9,.96,1,1.04],V1=128;function Bo(s,t){s.push(t),s.length>V1&&s.shift()}function ni(s,t){if(s.length===0)return 0;const e=[...s].sort((i,r)=>i-r),n=Math.min(e.length-1,Math.max(0,Math.ceil(t*e.length)-1));return Math.round(e[n]*100)/100}function Vm(s){return s>=45?2:s>=18?1:0}function G1(s){return s+64>>3&1}function H1(s,t,e,n){const i=Math.floor(s/2)+Math.floor(t/3)*17,r=Math.floor(e/2);return Math.floor(Ei(i,r,n+300)*4)}function W1(s,t,e,n,i){return s&15|(t&15)<<4|(e&3)<<8|(n&3)<<10|(i>0?1:0)<<12}const Bf=new Map;function X1(s){const t=Bf.get(s);if(t)return t;const e=s&15,n=s>>4&15,i=s>>8&3,r=s>>10&3,a=s>>12&1;let o;if(r===1&&a===1){const c=Math.min(2,n&3);e===Pt.GRASS?o=re.grassTop[c]:e===Pt.SAND?o=re.sand:e===Pt.GRAVEL?o=re.gravel:e===Pt.SOIL?o=re.ochre:e===Pt.ORE?o=re.ore:e===Pt.MOSS?o=re.moss:o=re.stoneTop}else if(r===1&&a===0)o=re.stoneShade;else{const c=n&7,f=n>>3&1?re.stoneB:re.stoneA;e===Pt.GRASS||e===Pt.MOSS?c===0?o=e===Pt.MOSS?re.moss:re.grassCap:c<=2?o=re.soil:c===3?o=re.rust:o=f:e===Pt.SOIL?o=c<=1?re.soil:f:e===Pt.SAND?o=c<=1?re.sand:c===2?re.ochre:f:e===Pt.GRAVEL?o=c<=1?re.gravel:f:e===Pt.ORE?o=re.ore:e===Pt.BEDROCK?o=re.stoneShade:o=f}const l=o.clone().multiplyScalar(k1[i]);return Bf.set(s,l),l}const Gm=new es({vertexColors:!0,side:Ii});Gm.onBeforeCompile=s=>{s.vertexShader=s.vertexShader.replace("#include <common>",`#include <common>
attribute float aMat;
varying vec3 vWPos;
varying vec3 vWNrm;
varying float vMat;`).replace("#include <begin_vertex>",`#include <begin_vertex>
vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vWNrm = normalize(mat3(modelMatrix) * objectNormal);
vMat = aMat;`),s.fragmentShader=s.fragmentShader.replace("#include <common>",`#include <common>
varying vec3 vWPos;
varying vec3 vWNrm;
varying float vMat;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float vn2(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x),
             mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}`).replace("#include <color_fragment>",`#include <color_fragment>
{
  vec3 n = normalize(vWNrm);
  float vert = 1.0 - smoothstep(0.35, 0.70, abs(n.y));
  float isGrass = ((vMat > 0.5 && vMat < 1.5) || (vMat > 8.5 && vMat < 9.5)) ? 1.0 : 0.0;
  float isStone = ((vMat > 4.5 && vMat < 6.5) || (vMat > 7.5 && vMat < 8.5)) ? 1.0 : 0.0;

  float horiz = abs(n.x) > abs(n.z) ? vWPos.z : vWPos.x;
  float row = floor(vWPos.y);
  float col = floor(horiz);
  float h = h21(vec2(col, row));
  vec2 f = vec2(fract(horiz), fract(vWPos.y));
  float joint = smoothstep(0.0, 0.055, min(f.x, 1.0 - f.x))
              * smoothstep(0.0, 0.050, min(f.y, 1.0 - f.y));
  vec3 stone = mix(vec3(0.62, 0.62, 0.58), vec3(1.04, 1.02, 0.95), h);
  stone *= mix(0.90, 1.0, joint);
  stone *= mix(0.93, 1.0, smoothstep(0.0, 0.30, f.y));
  diffuseColor.rgb *= mix(vec3(1.0), stone, vert * isStone);

  float gy = smoothstep(0.45, 0.88, abs(n.y));
  float g1 = vn2(vWPos.xz * 1.35);
  float g2 = vn2(vWPos.xz * 0.11);
  vec3 grass = mix(vec3(0.82, 0.86, 0.72), vec3(1.06, 1.04, 0.98), g1 * 0.42 + g2 * 0.46 + vn2(vWPos.xz * 4.3) * 0.12);
  float cell = h21(floor(vWPos.xz) + 17.0);
  grass *= 0.95 + 0.10 * cell;
  diffuseColor.rgb *= mix(vec3(1.0), grass, gy * isGrass);
}`)};function zf(s,t,e,n){return s===0?[t,e,n]:s===1?[n,t,e]:[e,n,t]}function q1(s,t){const e=Ia(t.cx),n=Pa(t.cz),i=t.data,r=(p,_,g)=>p>=0&&p<zt&&g>=0&&g<zt&&_>=0&&_<bs?i[si(p,_,g)]:C1(s,e+p,ce+_,n+g),a=[],o=[],l=[],c=[],h=[],f=[zt,bs,zt],u=(p,_,g,m,x,M,y,w)=>{const b=g+1,E=m,v=m+M,T=x,C=x+y;let P;if(p===0){const G=e+b,X=ce+E,$=ce+v,Z=n+T,ct=n+C;P=_>0?[[G,X,Z],[G,$,Z],[G,$,ct],[G,X,ct]]:[[G,X,Z],[G,X,ct],[G,$,ct],[G,$,Z]]}else if(p===1){const G=ce+b,X=n+E,$=n+v,Z=e+T,ct=e+C;P=_>0?[[Z,G,X],[Z,G,$],[ct,G,$],[ct,G,X]]:[[Z,G,X],[ct,G,X],[ct,G,$],[Z,G,$]]}else{const G=n+b,X=e+E,$=e+v,Z=ce+T,ct=ce+C;P=_>0?[[X,Z,G],[$,Z,G],[$,ct,G],[X,ct,G]]:[[X,Z,G],[X,ct,G],[$,ct,G],[$,Z,G]]}const L=X1(w),N=w&15,D=p===0?_:0,O=p===1?_:0,V=p===2?_:0,z=a.length/3;for(const G of P)a.push(G[0],G[1],G[2]),o.push(D,O,V),l.push(L.r,L.g,L.b),c.push(N);h.push(z,z+1,z+2,z,z+2,z+3)};for(let p=0;p<3;p++){const _=(p+1)%3,g=(p+2)%3,m=f[_],x=f[g],M=f[p],y=new Uint16Array(m*x);for(let w=-1;w<M;w++){y.fill(0);let b=!1;for(let E=0;E<x;E++)for(let v=0;v<m;v++){const[T,C,P]=zf(p,w,v,E),[L,N,D]=zf(p,w+1,v,E),O=r(T,C,P),V=r(L,N,D),z=Ff(O),G=Ff(V);if(z===G)continue;const X=w>=0&&w<M,$=w+1>=0&&w+1<M;let Z,ct,bt,$t,Wt;if(z&&!G&&X)Z=T,ct=C,bt=P,$t=O,Wt=1;else if(G&&!z&&$)Z=L,ct=N,bt=D,$t=V,Wt=-1;else continue;const Qt=ce+ct,tt=t.heights[bt*zt+Z]+ce-(Qt+1);let ft;p===1&&Wt>0?ft=Vm(Qt):p===1&&Wt<0?ft=15:ft=Math.max(0,Math.min(7,tt))&7|G1(Qt)<<3;const kt=H1(e+Z,Qt,n+bt,s.seed);y[E*m+v]=W1($t,ft,kt,p,Wt),b=!0}if(b)for(let E=0;E<x;E++)for(let v=0;v<m;){const T=y[E*m+v];if(!T){v++;continue}let C=1;for(;v+C<m&&y[E*m+v+C]===T;)C++;let P=1;t:for(;E+P<x;){for(let N=0;N<C;N++)if(y[(E+P)*m+v+N]!==T)break t;P++}for(let N=0;N<P;N++)for(let D=0;D<C;D++)y[(E+N)*m+v+D]=0;const L=T>>12&1?1:-1;u(p,L,w,v,E,C,P,T),v+=C}}}const d=new Zt;return d.setAttribute("position",new Mt(a,3)),d.setAttribute("normal",new Mt(o,3)),d.setAttribute("color",new Mt(l,3)),d.setAttribute("aMat",new Mt(c,1)),d.setIndex(h),d.computeBoundingSphere(),{geometry:d,triangles:h.length/3}}function Y1(s,t=2e4,e=96){const n=new Ps(t,t,e,e);n.rotateX(-Math.PI/2);const i=n.attributes.position,r=new Float32Array(i.count*3),a=new ut,o=(c,h,f)=>{const u=Math.max(0,Math.min(1,(f-c)/(h-c)));return u*u*(3-2*u)};for(let c=0;c<i.count;c++){const h=i.getX(c),f=i.getZ(c),u=Ms(s.seed,Math.round(h),Math.round(f)),d=o(-.9,-.15,u)*(1-o(-.15,.4,u)),p=Ei(Math.floor(h/45),Math.floor(f/45),s.seed+501);a.copy(re.waterMid).lerp(re.waterDeep,.35+.35*p),a.lerp(re.waterRim,d*.15),r[c*3]=a.r,r[c*3+1]=a.g,r[c*3+2]=a.b}n.setAttribute("color",new ue(r,3));const l=new be(n,new es({vertexColors:!0}));return l.position.y=-.06,l.renderOrder=1,l.name="water_surface",l.receiveShadow=!1,l}const Bh=new Map;function Z1(s,t){const e=`${s.seed}:${Fu}:${t}`,n=Bh.get(e);if(n)return n;const i=performance.now(),r=Math.ceil(Rs/t),a=new Int16Array(r*r),o=new Uint8Array(r*r),l=new Uint8Array(r*r),c=u=>-Te+(u+.5)*t,h=u=>-Te+(u+.5)*t;for(let u=0;u<r;u++)for(let d=0;d<r;d++){const p=c(d),_=h(u),g=Ms(s.seed,Math.round(p),Math.round(_)),m=u*r+d;a[m]=g,g<Oe&&(l[m]=1)}for(let u=0;u<r;u++)for(let d=0;d<r;d++){const p=u*r+d;if(l[p])continue;const _=a[p],g=c(d),m=h(u);let x=0,M=!1;const y=[[-1,0],[1,0],[0,-1],[0,1]];for(const[w,b]of y){const E=Math.max(0,Math.min(r-1,d+w)),v=Math.max(0,Math.min(r-1,u+b)),T=a[v*r+E];x=Math.max(x,Math.abs(_-T)),T<Oe+1&&(M=!0)}o[p]=S1(s.seed,Math.round(g),Math.round(m),_,x,M)}const f={N:r,heights:a,tops:o,underwater:l,sampleMs:performance.now()-i};return Bh.set(e,f),f}function $1(s,t){const e=performance.now(),{step:n,hole:i}=t,r=`${s.seed}:${Fu}:${n}`,a=Bh.has(r),o=Z1(s,n),{N:l,heights:c,tops:h,underwater:f}=o,u=new Uint8Array(l*l),d=C=>-Te+(C+.5)*n,p=C=>-Te+(C+.5)*n;if(i)for(let C=0;C<l;C++)for(let P=0;P<l;P++){const L=d(P),N=p(C);L>i.minX&&L<i.maxX&&N>i.minZ&&N<i.maxZ&&(u[C*l+P]=1)}const _=a?0:o.sampleMs,g=[],m=[],x=[],M=[],y=(C,P,L)=>{const N=g.length/3;for(const D of C)g.push(D[0],D[1],D[2]),m.push(P[0],P[1],P[2]),x.push(L.r,L.g,L.b);M.push(N,N+1,N+2,N,N+2,N+3)},w=(C,P)=>.94+.12*Ei(C,P,s.seed+401),b=(C,P,L,N)=>{const D=w(L,N),O=_e(d(L)/130,p(N)/130,s.seed+601,3);return C===Pt.SAND?re.sand.clone().multiplyScalar(D*.9):C===Pt.GRAVEL?re.gravel.clone().multiplyScalar(D):C===Pt.STONE?re.stoneShade.clone().lerp(re.stoneB,.35+.25*D).multiplyScalar((.82+.14*Math.min(1,Math.max(0,(P+8)/70)))*(.92+.08*D)):C===Pt.ORE?re.ore.clone().multiplyScalar(D):re.grassTop[Vm(P)].clone().lerp(re.grassCap,.12+.34*O).multiplyScalar(D)},E=(C,P,L,N,D)=>{const O=P-L,V=.9+.1*Ei(N,D,s.seed+402);return C===Pt.SAND?re.sand.clone().lerp(re.stoneB,O>5?.55:.2).multiplyScalar(V*.92):C===Pt.STONE?re.stoneShade.clone().multiplyScalar((.8+.16*Math.min(1,Math.max(0,(P+8)/70)))*V):O>4?re.grassCap.clone().lerp(re.ochre,.55).multiplyScalar(V):re.grassCap.clone().lerp(re.stoneB,.22).multiplyScalar(V)};for(let C=0;C<l;C++)for(let P=0;P<l;P++){const L=C*l+P;if(u[L]||f[L])continue;const N=c[L],D=h[L],O=-Te+P*n,V=O+n,z=-Te+C*n,G=z+n;y([[O,N,z],[O,N,G],[V,N,G],[V,N,z]],[0,1,0],b(D,N,P,C));const X=($,Z)=>{const ct=P+$,bt=C+Z;let $t;if(ct<0||bt<0||ct>=l||bt>=l)return;{const Qt=bt*l+ct;if(u[Qt])return;$t=f[Qt]?Math.max(Oe-.5,c[Qt]):c[Qt]}if(N<=$t)return;const Wt=E(D,N,$t,P,C);$===1?y([[V,$t,z],[V,N,z],[V,N,G],[V,$t,G]],[1,0,0],Wt):$===-1?y([[O,$t,z],[O,$t,G],[O,N,G],[O,N,z]],[-1,0,0],Wt):Z===1?y([[O,$t,G],[V,$t,G],[V,N,G],[O,N,G]],[0,0,1],Wt):Z===-1&&y([[O,$t,z],[O,N,z],[V,N,z],[V,$t,z]],[0,0,-1],Wt)};X(1,0),X(-1,0),X(0,1),X(0,-1)}const v=new Zt;v.setAttribute("position",new Mt(g,3)),v.setAttribute("normal",new Mt(m,3)),v.setAttribute("color",new Mt(x,3)),v.setIndex(M),v.computeBoundingSphere();const T=new be(v,new es({vertexColors:!0,flatShading:!0}));return T.name="macro_lod",T.castShadow=!1,T.receiveShadow=!1,{mesh:T,triangles:M.length/3,sampleMs:_,totalMs:performance.now()-e,sampleCached:a}}class J1{group=new vn;nearGroup=new vn;macroGroup=new vn;water;world;nearRadius;worldMacroStep;mapMacroStep;chunks=new Map;loaded=new Set;mode="world";macro=null;macroTriangles=0;macroFocus=new I(1e9,0,1e9);macroMode=null;chunkGenSamples=[];chunkMeshSamples=[];macroSamples=[];macroSampleSamples=[];macroCacheHits=0;onChunksChanged=null;constructor(t,e,n={}){this.world=t,this.nearRadius=Math.max(1,n.nearRadius??3),this.worldMacroStep=Math.max(4,n.worldMacroStep??8),this.mapMacroStep=Math.max(4,n.mapMacroStep??8),this.group.name="voxel_world",this.nearGroup.name="voxel_chunks",this.macroGroup.name="macro_lod",this.group.add(this.nearGroup,this.macroGroup),this.water=Y1(t),this.group.add(this.water),e.add(this.group)}preload(t){this.mode="world",this.ensureChunks(t,!0),this.rebuildMacro(t,"world",!0)}update(t,e="world"){if(e!==this.mode&&(this.mode=e,this.nearGroup.visible=e!=="map",this.rebuildMacro(t,e,!0)),e==="map")return;this.ensureChunks(t,!1);for(const i of this.loaded)this.world.dirty.has(i)&&this.rebuildChunk(i);const n=Math.hypot(t.x-this.macroFocus.x,t.z-this.macroFocus.z);(this.macroMode!==e||n>48)&&this.rebuildMacro(t,e,!1)}ensureChunks(t,e){const n=qi(Math.round(t.x)),i=Yi(Math.round(t.z));let r=!1,a=e?Number.MAX_SAFE_INTEGER:2;for(let l=-this.nearRadius;l<=this.nearRadius;l++)for(let c=-this.nearRadius;c<=this.nearRadius;c++){const h=n+c,f=i+l;if(h<0||f<0||h>=Is||f>=Is)continue;const u=ur(h,f);this.loaded.has(u)||a<=0||(this.buildChunk(h,f),a--,r=!0)}const o=this.nearRadius+1;for(const l of[...this.loaded]){const[c,h]=l.split(",").map(Number);(Math.abs(c-n)>o||Math.abs(h-i)>o)&&(this.disposeChunk(l),r=!0)}r&&this.onChunksChanged?.()}buildChunk(t,e){const n=ur(t,e),i=this.world.stats.generationMs,r=this.world.stats.chunksGenerated;for(let d=-1;d<=1;d++)for(let p=-1;p<=1;p++)La(this.world,t+p,e+d);const a=La(this.world,t,e);if(!a)return;const o=this.world.stats.chunksGenerated-r;o>0&&Bo(this.chunkGenSamples,(this.world.stats.generationMs-i)/o);const l=this.chunks.get(n);l&&(this.nearGroup.remove(l.mesh),l.mesh.geometry.dispose());const c=performance.now(),{geometry:h,triangles:f}=q1(this.world,a);Bo(this.chunkMeshSamples,performance.now()-c);const u=new be(h,Gm);u.name=`voxel_chunk_${t}_${e}`,u.receiveShadow=!0,u.castShadow=!1,this.nearGroup.add(u),this.chunks.set(n,{mesh:u,triangles:f}),this.loaded.add(n),this.world.dirty.delete(n)}disposeChunk(t){const e=this.chunks.get(t);e&&(this.nearGroup.remove(e.mesh),e.mesh.geometry.dispose(),this.chunks.delete(t)),this.loaded.delete(t),this.world.dirty.delete(t),E1(this.world,t)}rebuildChunk(t){const[e,n]=t.split(",").map(Number);this.buildChunk(e,n)}rebuildAround(t,e){const n=qi(t),i=Yi(e);for(let r=-1;r<=1;r++)for(let a=-1;a<=1;a++){const o=ur(n+a,i+r);this.loaded.has(o)&&this.rebuildChunk(o)}this.onChunksChanged?.()}rebuildMacro(t,e,n){if(!n&&this.macroMode===e){const l=Math.hypot(t.x-this.macroFocus.x,t.z-this.macroFocus.z);if(e==="map"||l<=48)return}const i=performance.now();this.macro&&(this.macroGroup.remove(this.macro),this.macro.geometry.dispose(),this.macro=null);const r=e==="map"?this.mapMacroStep:this.worldMacroStep;let a;if(e!=="map"){const l=qi(Math.round(t.x)),c=Yi(Math.round(t.z));a={minX:Ia(l-this.nearRadius),maxX:Ia(l+this.nearRadius)+zt,minZ:Pa(c-this.nearRadius),maxZ:Pa(c+this.nearRadius)+zt}}const o=$1(this.world,{step:r,hole:a});this.macro=o.mesh,this.macroTriangles=o.triangles,this.macroGroup.add(o.mesh),this.macroFocus.copy(t),this.macroMode=e,Bo(this.macroSamples,performance.now()-i),o.sampleCached?this.macroCacheHits++:Bo(this.macroSampleSamples,o.sampleMs)}get loadedChunks(){return this.loaded.size}get loadedChunkKeys(){return this.loaded}get nearTriangles(){let t=0;for(const e of this.chunks.values())t+=e.triangles;return t}get macroTriangleCount(){return this.macroTriangles}get drawCalls(){return this.loaded.size+(this.macro?1:0)+1}get nearRadiusChunks(){return this.nearRadius}resetPerf(){this.chunkGenSamples.length=0,this.chunkMeshSamples.length=0,this.macroSamples.length=0,this.macroSampleSamples.length=0,this.macroCacheHits=0}get streamPerf(){return{chunkGenP50:ni(this.chunkGenSamples,.5),chunkGenP95:ni(this.chunkGenSamples,.95),chunkGenMax:ni(this.chunkGenSamples,1),chunkMeshP50:ni(this.chunkMeshSamples,.5),chunkMeshP95:ni(this.chunkMeshSamples,.95),chunkMeshMax:ni(this.chunkMeshSamples,1),macroP50:ni(this.macroSamples,.5),macroMax:ni(this.macroSamples,1),macroSampleP50:ni(this.macroSampleSamples,.5),macroSampleMax:ni(this.macroSampleSamples,1),macroCacheHits:this.macroCacheHits,chunkSamples:this.chunkGenSamples.length,macroSamples:this.macroSamples.length}}}function Hm(s,t=!1){const e=s[0].index!==null,n=new Set(Object.keys(s[0].attributes)),i=new Set(Object.keys(s[0].morphAttributes)),r={},a={},o=s[0].morphTargetsRelative,l=new Zt;let c=0;for(let h=0;h<s.length;++h){const f=s[h];let u=0;if(e!==(f.index!==null))return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+h+". All geometries must have compatible attributes; make sure index attribute exists among all geometries, or in none of them."),null;for(const d in f.attributes){if(!n.has(d))return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+h+'. All geometries must have compatible attributes; make sure "'+d+'" attribute exists among all geometries, or in none of them.'),null;r[d]===void 0&&(r[d]=[]),r[d].push(f.attributes[d]),u++}if(u!==n.size)return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+h+". Make sure all geometries have the same number of attributes."),null;if(o!==f.morphTargetsRelative)return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+h+". .morphTargetsRelative must be consistent throughout all geometries."),null;for(const d in f.morphAttributes){if(!i.has(d))return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+h+".  .morphAttributes must be consistent throughout all geometries."),null;a[d]===void 0&&(a[d]=[]),a[d].push(f.morphAttributes[d])}if(t){let d;if(e)d=f.index.count;else if(f.attributes.position!==void 0)d=f.attributes.position.count;else return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+h+". The geometry must have either an index or a position attribute"),null;l.addGroup(c,d,h),c+=d}}if(e){let h=0;const f=[];for(let u=0;u<s.length;++u){const d=s[u].index;for(let p=0;p<d.count;++p)f.push(d.getX(p)+h);h+=s[u].attributes.position.count}l.setIndex(f)}for(const h in r){const f=kf(r[h]);if(!f)return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the "+h+" attribute."),null;l.setAttribute(h,f)}for(const h in a){const f=a[h][0].length;if(f!==0){l.morphAttributes=l.morphAttributes||{},l.morphAttributes[h]=[];for(let u=0;u<f;++u){const d=[];for(let _=0;_<a[h].length;++_)d.push(a[h][_][u]);const p=kf(d);if(!p)return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the "+h+" morphAttribute."),null;l.morphAttributes[h].push(p)}}}return l}function kf(s){let t,e,n,i=-1,r=0;for(let c=0;c<s.length;++c){const h=s[c];if(t===void 0&&(t=h.array.constructor),t!==h.array.constructor)return console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.array must be of consistent array types across matching attributes."),null;if(e===void 0&&(e=h.itemSize),e!==h.itemSize)return console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.itemSize must be consistent across matching attributes."),null;if(n===void 0&&(n=h.normalized),n!==h.normalized)return console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.normalized must be consistent across matching attributes."),null;if(i===-1&&(i=h.gpuType),i!==h.gpuType)return console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.gpuType must be consistent across matching attributes."),null;r+=h.count*e}const a=new t(r),o=new ue(a,e,n);let l=0;for(let c=0;c<s.length;++c){const h=s[c];if(h.isInterleavedBufferAttribute){const f=l/e;for(let u=0,d=h.count;u<d;u++)for(let p=0;p<e;p++){const _=h.getComponent(u,p);o.setComponent(u+f,p,_)}}else a.set(h.array,l);l+=h.count*e}return i!==void 0&&(o.gpuType=i),o}const K1=Ac.materials,Rn=s=>K1[s].hex,tn=[Rn("canopy_green_a"),Rn("canopy_green_b"),Rn("canopy_green_c")],Xr=[Rn("canopy_pink_b"),Rn("canopy_pink")],Q1=Rn("trunk"),j1=Rn("bark_dark"),ii=Rn("stone_top"),dr=Rn("stone_body_b"),Wm=Rn("stone_shade"),tw=Rn("ore_crystal"),ew=Rn("ore_crystal_b");Rn("strata_ochre");function Ou(s,t){const e=s.index?s.toNonIndexed():s;e.deleteAttribute("uv");const n=new ut(t),i=e.attributes.position.count,r=new Float32Array(i*3);for(let a=0;a<i;a++)r[a*3]=n.r,r[a*3+1]=n.g,r[a*3+2]=n.b;return e.setAttribute("color",new ue(r,3)),e}function Fe(s,t,e,n,i,r,a){const o=new Ni(n,i,r);o.translate(s,t,e);const l=Ou(o,a);return l.computeVertexNormals(),l}function Vf(s,t,e,n,i,r,a,o){const l=new Ar(i,i,n,r,1,!1);l.translate(s,e+n/2,t),l.rotateY(a*Math.PI/180);const c=Ou(l,o);return c.computeVertexNormals(),c}function zh(s){const t=[],e=[],n=Math.PI/180,i=d=>s.yawDeg*n+d*2*Math.PI/s.sides,r=d=>{const p=d*n,_=Math.cos(p),g=Math.sin(p),m=[];for(let x=0;x<s.sides;x++){const M=i(x);m.push([s.cx+s.rx*_*Math.cos(M),s.cy+s.ry*g,s.cz+s.rz*_*Math.sin(M)])}return m},a=d=>[s.cx,s.cy+d*s.ry,s.cz],o=d=>[s.cx,s.cy+s.ry*Math.sin(d*n),s.cz],l=(d,p,_)=>{const g=p[0]-d[0],m=p[1]-d[1],x=p[2]-d[2],M=_[0]-d[0],y=_[1]-d[1],w=_[2]-d[2];let b=m*w-x*y,E=x*M-g*w,v=g*y-m*M;const T=Math.hypot(b,E,v)||1;b/=T,E/=T,v/=T;const C=(d[0]+p[0]+_[0])/3-s.cx,P=(d[1]+p[1]+_[1])/3-s.cy,L=(d[2]+p[2]+_[2])/3-s.cz;if(b*C+E*P+v*L<0){const N=p;p=_,_=N,b=-b,E=-E,v=-v}for(const N of[d,p,_])t.push(N[0],N[1],N[2]),e.push(b,E,v)},c=(d,p)=>{for(let _=0;_<s.sides;_++){const g=(_+1)%s.sides;l(d[_],d[g],p[_]),l(d[g],p[g],p[_])}},h=(d,p)=>{for(let _=0;_<s.sides;_++)l(d[_],d[(_+1)%s.sides],p)},f=(d,p)=>{for(let _=0;_<s.sides;_++)l(d[(_+1)%s.sides],d[_],p)};if(s.shape==="orb"){const d=[r(-45),r(0),r(45)];c(d[0],d[1]),c(d[1],d[2]),h(d[0],a(-1)),h(d[2],a(1))}else if(s.shape==="dome"){const d=[r(0),r(45)];c(d[0],d[1]),h(d[1],a(1)),f(d[0],o(0))}else{const d=[r(-45),r(0),r(45)];c(d[0],d[1]),c(d[1],d[2]),f(d[0],o(-45)),f(d[2],o(45))}const u=new Zt;return u.setAttribute("position",new Mt(t,3)),u.setAttribute("normal",new Mt(e,3)),Ou(u,s.hex)}function ws(s){const t=Hm(s,!1);if(!t)throw new Error("Styl geometry merge failed");return t.computeBoundingBox(),t.computeBoundingSphere(),t}const Xm={trunkR:.28,trunkH:4.9,flareH:.3,masses:[{cx:0,cy:5.45,cz:0,rx:2.1,ry:1,rz:2.05,sides:9,shape:"orb",yawDeg:0,hex:tn[0]},{cx:.2,cy:6.85,cz:-.2,rx:1.45,ry:.95,rz:1.35,sides:7,shape:"orb",yawDeg:15,hex:tn[1]},{cx:-.15,cy:7.85,cz:.15,rx:.95,ry:.65,rz:.9,sides:7,shape:"orb",yawDeg:30,hex:tn[2]}],satellite:{cx:2.4,cy:5.55,cz:.75,sx:.8,sy:.5,sz:.8,hex:tn[2]}},qm={trunkR:.34,trunkH:3.85,flareH:.28,masses:[{cx:0,cy:3.5,cz:0,rx:2.95,ry:1.3,rz:2.3,sides:11,shape:"dome",yawDeg:0,hex:tn[0]},{cx:1.35,cy:4,cz:-.6,rx:1.45,ry:.95,rz:1.25,sides:9,shape:"dome",yawDeg:15,hex:tn[1]},{cx:-.35,cy:5.2,cz:.25,rx:1.35,ry:.95,rz:1.25,sides:9,shape:"orb",yawDeg:30,hex:tn[2]},{cx:-1.45,cy:4.05,cz:.95,rx:1.1,ry:.75,rz:1,sides:7,shape:"dome",yawDeg:45,hex:tn[1]}]},Ym={trunkR:.26,trunkH:3.6,flareH:.26,masses:[{cx:0,cy:4.55,cz:0,rx:1.45,ry:1.3,rz:1.4,sides:9,shape:"orb",yawDeg:0,hex:tn[0]},{cx:1.25,cy:4.05,cz:.3,rx:.95,ry:.8,rz:.9,sides:7,shape:"orb",yawDeg:15,hex:tn[1]},{cx:-1.3,cy:4.45,cz:-.45,rx:.85,ry:.75,rz:.85,sides:7,shape:"orb",yawDeg:30,hex:tn[1]},{cx:.1,cy:5.7,cz:-.1,rx:1,ry:.9,rz:.95,sides:7,shape:"orb",yawDeg:45,hex:tn[2]}],satellite:{cx:2.35,cy:3.9,cz:-.25,sx:.7,sy:.45,sz:.7,hex:tn[2]}},nw={trunkR:.3,trunkH:4.45,flareH:.28,masses:[{cx:0,cy:5,cz:0,rx:2.35,ry:1.15,rz:2.2,sides:9,shape:"drum",yawDeg:0,hex:Xr[0]},{cx:.3,cy:5.9,cz:-.25,rx:1.55,ry:1,rz:1.45,sides:9,shape:"drum",yawDeg:15,hex:Xr[1]},{cx:-1.4,cy:4.95,cz:.75,rx:1.05,ry:.8,rz:1,sides:7,shape:"drum",yawDeg:30,hex:Xr[0]},{cx:.15,cy:6.45,cz:.1,rx:.95,ry:.65,rz:.9,sides:7,shape:"orb",yawDeg:45,hex:Xr[1]}],satellite:{cx:2.55,cy:5.35,cz:.85,sx:.85,sy:.55,sz:.85,hex:Xr[1]}},iw=[{cx:0,cy:.55,cz:0,rx:.7,ry:.55,rz:.65,sides:9,shape:"orb",yawDeg:0,hex:tn[0]},{cx:.25,cy:.95,cz:-.15,rx:.45,ry:.42,rz:.42,sides:7,shape:"orb",yawDeg:15,hex:tn[1]},{cx:-.2,cy:1.05,cz:.2,rx:.34,ry:.45,rz:.32,sides:7,shape:"orb",yawDeg:30,hex:tn[2]}],lr=s=>Math.round(s/.05)*.05,kh=(s,t,e)=>s<t?t:s>e?e:s;function Zm(s,t,e,n){const i=r=>lr(kh(r*(1+(t()*.16-.08)),.25,4));return{...s,cx:lr(s.cx+e+(t()*.6-.3)),cy:lr(s.cy+(t()*.4-.2)),cz:lr(s.cz+n+(t()*.6-.3)),rx:i(s.rx),ry:i(s.ry),rz:i(s.rz),yawDeg:s.yawDeg+(Math.floor(t()*3)-1)*15}}function zo(s,t){const e=wc((s===Xm?11:s===qm?23:s===Ym?37:53)*7919+t*104729),n=t>0,i=n?e()*.7-.35:0,r=n?e()*.7-.35:0,a=n?lr(kh(s.trunkR+(e()*.1-.05),.2,.4)):s.trunkR,o=n?lr(kh(s.trunkH+(e()*.6-.3),3,5.4)):s.trunkH,l=a+.1,c=[Vf(0,0,0,o,a,6,0,Q1),Vf(0,0,0,s.flareH,l,6,0,j1)];for(const h of s.masses)c.push(zh(n?Zm(h,e,i,r):h));if(s.satellite&&t%3===0){const h=s.satellite;c.push(Fe(h.cx+i,h.cy,h.cz+r,h.sx,h.sy,h.sz,h.hex))}return ws(c)}function sw(s){const t=wc(768143+s*104729),e=iw.map((n,i)=>zh(s===0&&i===0?n:Zm(n,t,0,0)));return ws(e)}function xh(s,t){const e=wc((s==="small"?5:s==="medium"?7:9)*7919+t*104729),n=t===0?0:1,i=()=>(e()*2-1)*(s==="small"?.15:s==="medium"?.25:.35)*n,r=()=>(e()*2-1)*(s==="small"?.15:s==="medium"?.25:.35)*n;return ws(s==="small"?[Fe(0+i(),.2,0+r(),.8,.4,.7,ii),Fe(.1+i(),.5,-.05+r(),.5,.3,.45,ii),Fe(-.2+i(),.6,.1+r(),.3,.2,.3,dr)]:s==="medium"?[Fe(0+i(),.45,0+r(),1.8,.9,1.5,ii),Fe(.15+i(),1.1,-.1+r(),1.2,.7,1,ii),Fe(-.4+i(),1.4,.25+r(),.7,.5,.6,dr)]:[Fe(0+i(),.7,0+r(),3,1.4,2.4,ii),Fe(.3+i(),1.8,-.2+r(),1.8,1,1.4,ii),Fe(-.6+i(),2.4,.4+r(),1.1,.9,.9,dr),Fe(.9+i(),2.2,-.7+r(),.6,.5,.55,Wm)])}function rw(s){const t=s===1?-1:1,e=[Fe(0,.45,0,1.8,.9,1.5,ii),Fe(.15,1.1,-.1,1.2,.7,1,ii),Fe(-.4,1.4,.25,.7,.5,.6,dr),Fe(.1,.45,.75*t,.9,.35,.2,tw),Fe(.1,.45,.865*t,.5,.14,.07,ew)];return ws(e)}function aw(){return ws([Fe(0,.25,0,1.5,.5,1.3,ii),Fe(.1,.725,0,1.15,.45,1,dr),Fe(-.1,1.15,.05,.85,.4,.75,ii),Fe(.1,1.525,.05,.5,.35,.5,dr),Fe(.1,1.85,.05,.3,.3,.3,Wm)])}function Gf(s,t){return s==="styl_tree_spire"?zo(Xm,Math.abs(t)%4):s==="styl_tree_table"?zo(qm,Math.abs(t)%4):s==="styl_tree_cluster"?zo(Ym,Math.abs(t)%3):s==="styl_tree_blossom"?zo(nw,Math.abs(t)%2):s==="styl_shrub"?sw(Math.abs(t)%3):s==="styl_rock_small"?xh("small",Math.abs(t)%3):s==="styl_rock_medium"?xh("medium",Math.abs(t)%3):s==="styl_rock_large"?xh("large",Math.abs(t)%3):s==="styl_ore"?rw(Math.abs(t)%2):s==="styl_cairn"?aw():null}const ow=new es({vertexColors:!0,flatShading:!0});function lw(s,t=null){const e=new vn;e.name="styl_nature";const n=new Map;for(const g of s.entities.values()){if(g.harvested||t&&!t.has(g.chunk)||!Gf(g.kind,g.variant))continue;const m=`${g.kind}:${g.variant}`;let x=n.get(m);x||(x=[],n.set(m,x)),x.push(g)}let i=0,r=0;const a=new Map;for(const[g,m]of n){const[x,M]=g.split(":"),y=Gf(x,Number(M));y&&(a.set(g,y.index?y.toNonIndexed():y),i+=y.attributes.position.count/3*m.length,r+=m.length)}if(r===0)return{group:e,triangles:0,instances:0};let o=0;for(const g of a.values())o+=g.attributes.position.count;const l=new uu(r,Math.ceil(o*1.08)+16,0,ow);l.name="styl_nature_batch",l.castShadow=!0,l.receiveShadow=!0,l.perObjectFrustumCulled=!0;const c=new Map;for(const[g,m]of a)c.set(g,l.addGeometry(m));const h=new Yt,f=new sn,u=new I,d=new I,p=new I(0,1,0);let _=0;for(const[g,m]of n){const x=c.get(g);if(x!==void 0)for(const M of m){const y=l.addInstance(x);f.setFromAxisAngle(p,M.rot),u.set(M.x,M.y-.15,M.z),d.setScalar(M.scale),l.setMatrixAt(y,h.compose(u,f,d)),_++}}return l.computeBoundingBox(),l.computeBoundingSphere(),e.add(l),{group:e,triangles:i,instances:_}}const cw=Ac.materials,je=s=>cw[s].hex,qe=je("noxel_stone"),fn=je("noxel_stone_b"),hw=je("strata_ochre");je("bark_dark");je("accent_blue");function uw(s){const t=new Ni(s.w,s.h,s.d);t.translate(s.x??0,(s.y??0)+s.h/2,s.z??0);const e=t.index?t.toNonIndexed():t;e.deleteAttribute("uv");const n=new ut(s.colour),i=e.attributes.position.count,r=new Float32Array(i*3);for(let a=0;a<i;a++)r[a*3]=n.r,r[a*3+1]=n.g,r[a*3+2]=n.b;return e.setAttribute("color",new ue(r,3)),e}const dw=new es({vertexColors:!0,flatShading:!0});function ji(s,t,e=dw){const n=Hm(s.map(uw),!1);n.computeVertexNormals();const i=new be(n,e);return i.name=t,i.castShadow=!0,i.receiveShadow=!1,i}function fw(){return ji([{w:4,h:.4,d:1.2,y:0,colour:fn},{w:3.8,h:.2,d:1,y:.4,colour:hw},{w:4,h:3.2,d:.6,y:.4,colour:qe},{w:4,h:.3,d:.6,x:0,y:3.6,colour:fn},{w:.3,h:.3,d:.7,x:-1.4,y:3.9,colour:qe},{w:.3,h:.3,d:.7,x:0,y:3.9,colour:qe},{w:.3,h:.3,d:.7,x:1.4,y:3.9,colour:qe}],"noxel_wall")}function pw(){return ji([{w:1.8,h:.4,d:1.8,y:0,colour:fn},{w:1.2,h:4.8,d:1.2,y:.4,colour:qe},{w:1.6,h:.3,d:1.6,y:5.2,colour:fn}],"noxel_post")}function mw(){return ji([{w:1.8,h:.4,d:1.8,x:-2.4,y:0,colour:fn},{w:1.8,h:.4,d:1.8,x:2.4,y:0,colour:fn},{w:1.2,h:4.8,d:1.2,x:-2.4,y:.4,colour:qe},{w:1.2,h:4.8,d:1.2,x:2.4,y:.4,colour:qe},{w:6,h:.8,d:1.2,y:5.2,colour:qe},{w:1.6,h:.3,d:1.6,x:-2.4,y:6,colour:fn},{w:1.6,h:.3,d:1.6,x:2.4,y:6,colour:fn}],"noxel_gateway")}function gw(){const s=[];for(let t=0;t<4;t++)s.push({w:2,h:.3,d:.9,z:t*.9,y:t*.3,colour:t%2?fn:qe});return s.push({w:2,h:.3,d:2,z:3.6,y:1.2,colour:qe}),ji(s,"noxel_stair")}const $m=new es({vertexColors:!0,flatShading:!0,emissive:new ut(je("accent_teal")),emissiveIntensity:.55});function Jm(){const s=ji([{w:3.2,h:.5,d:2.6,y:0,colour:fn},{w:2.4,h:.35,d:2,y:.45,colour:qe},{w:1.7,h:2.9,d:1.25,y:.75,colour:qe},{w:2.1,h:.33,d:1.5,y:3.6,colour:fn},{w:1,h:2.32,d:.85,y:3.88,colour:qe},{w:1.25,h:.35,d:.95,y:6.15,colour:qe},{w:.35,h:1.4,d:.55,x:-.45,y:6.45,colour:fn},{w:.35,h:1.4,d:.55,x:.45,y:6.45,colour:fn}],"noxel_waystone"),t=ji([{w:.18,h:1.65,d:.055,x:-.23,z:-.655,y:1.2,colour:je("accent_teal")},{w:.18,h:1.65,d:.055,x:.23,z:-.655,y:1.2,colour:je("accent_teal")},{w:.18,h:1.65,d:.055,x:-.23,z:.655,y:1.2,colour:je("accent_teal")},{w:.18,h:1.65,d:.055,x:.23,z:.655,y:1.2,colour:je("accent_teal")},{w:1.15,h:.13,d:1.35,y:3.66,colour:je("accent_blue")},{w:.05,h:.55,d:.55,x:.53,y:4.35,colour:je("accent_teal")},{w:.05,h:.55,d:.55,x:-.53,y:4.35,colour:je("accent_teal")}],"noxel_waystone_glow",$m),e=new vn;return e.add(s,t),e.name="noxel_waystone",s.castShadow=!0,e}function _w(){const s=ji([{w:1.8,h:.4,d:1.8,y:0,colour:fn},{w:1.2,h:.25,d:1.2,y:.4,colour:qe},{w:.7,h:2.6,d:.7,y:.65,colour:qe},{w:1.15,h:.22,d:1.15,y:3.25,colour:fn},{w:.35,h:.55,d:.35,y:3.47,colour:qe}],"noxel_marker"),t=ji([{w:.24,h:1.15,d:.04,z:-.37,y:1,colour:je("accent_teal")},{w:.24,h:1.15,d:.04,z:.37,y:1,colour:je("accent_teal")},{w:.52,h:.1,d:.52,y:3.36,colour:je("accent_blue")}],"noxel_marker_glow",$m),e=new vn;return e.add(s,t),e.name="noxel_marker",e}function xw(s){const t=s.kind==="waystone"?Jm():_w();return t.position.set(s.x,s.y-.12,s.z),t.rotation.y=s.rot,t}function yw(){return[{name:"Post",build:pw,x:-9,z:0},{name:"Wall panel",build:fw,x:-4.5,z:0},{name:"Gateway",build:mw,x:2.5,z:0},{name:"Stair",build:gw,x:5.8,z:.2},{name:"Waystone",build:Jm,x:13.2,z:2.2}].map(t=>{const e=t.build();return e.position.x=t.x,e.position.z=t.z,t.name==="Stair"&&(e.rotation.y=Math.PI/2),e})}const qr=Ac.lighting,_s=[{t:0,p:qr.night},{t:.22,p:qr.dawn},{t:.5,p:qr.noon},{t:.78,p:qr.dusk},{t:1,p:qr.night}],ir=(s,t,e)=>s+(t-s)*e,Yr=(s,t,e,n)=>n.copy(new ut(s)).lerp(new ut(t),e);class vw{sun;hemi;fog;scene;renderer;focus=new I;dome;domeGeo;domeBottom=new ut("#DCEFF8");domeTop=new ut("#7CBEE6");sunDisc;sunDiscMat;fogScale=.55;hemiScale=1.25;constructor(t,e){this.scene=t,this.renderer=e,this.sun=new Ru("#FFF4DC",2.75),this.sun.castShadow=!0,this.sun.shadow.mapSize.set(2048,2048);const n=this.sun.shadow.camera;n.left=-180,n.right=180,n.top=180,n.bottom=-180,n.near=1,n.far=900,this.sun.shadow.bias=-4e-4,this.sun.shadow.normalBias=.045,this.hemi=new Cu("#BFD9F2","#7A8F55",.55),this.fog=new Ua("#DCEFF8",.0028),t.add(this.sun),t.add(this.sun.target),t.add(this.hemi),t.fog=this.fog,t.background=new ut("#9ED2EE"),this.domeGeo=new Tr(8e3,32,16);const i=this.domeGeo.attributes.position.count;this.domeGeo.setAttribute("color",new ue(new Float32Array(i*3),3)),this.dome=new be(this.domeGeo,new hi({vertexColors:!0,side:nn,fog:!1,toneMapped:!1,depthWrite:!1})),this.dome.renderOrder=-10,this.dome.name="sky_dome",t.add(this.dome),this.sunDiscMat=new hi({color:"#FFF4DC",fog:!1,transparent:!0,opacity:.9,depthWrite:!1,side:Xn,toneMapped:!1}),this.sunDisc=new be(new Oa(120,28),this.sunDiscMat),this.sunDisc.name="sun_disc",this.sunDisc.renderOrder=-9,t.add(this.sunDisc),this.paintDome()}setFocus(t){this.focus.copy(t)}paintDome(){const t=this.domeGeo.attributes.position,e=this.domeGeo.attributes.color,n=e.array;for(let i=0;i<t.count;i++){const r=Math.max(0,Math.min(1,t.getY(i)/8e3)),a=Math.pow(r,.62);n[i*3]=this.domeBottom.r+(this.domeTop.r-this.domeBottom.r)*a,n[i*3+1]=this.domeBottom.g+(this.domeTop.g-this.domeBottom.g)*a,n[i*3+2]=this.domeBottom.b+(this.domeTop.b-this.domeBottom.b)*a}e.needsUpdate=!0}update(t){let e=0;for(;e<_s.length-2&&t>_s[e+1].t;)e++;const n=_s[e].p,i=_s[e+1].p,r=_s[e+1].t-_s[e].t,a=r<=0?0:Math.min(1,Math.max(0,(t-_s[e].t)/r)),o=An.degToRad(ir(n.sunElevationDeg,i.sunElevationDeg,a)),l=An.degToRad(ir(n.sunAzimuthDeg,i.sunAzimuthDeg,a)),c=new I(Math.cos(o)*Math.sin(l),Math.sin(o),Math.cos(o)*Math.cos(l));this.sun.position.copy(this.focus).addScaledVector(c,450),this.sun.target.position.copy(this.focus),Yr(n.sunColor,i.sunColor,a,this.sun.color),this.sun.intensity=ir(n.sunIntensity,i.sunIntensity,a),Yr(n.hemiSky,i.hemiSky,a,this.hemi.color),Yr(n.hemiGround,i.hemiGround,a,this.hemi.groundColor),this.hemi.intensity=ir(n.hemiIntensity,i.hemiIntensity,a)*this.hemiScale;const h=this.scene.background;Yr(n.sky,i.sky,a,h),Yr(n.fog,i.fog,a,this.fog.color),this.fog.density=ir(n.fogDensity,i.fogDensity,a)*this.fogScale,this.renderer.toneMappingExposure=ir(n.exposure,i.exposure,a),this.domeBottom.copy(this.fog.color).lerp(new ut("#F7FBFF"),.12),this.domeTop.copy(h).lerp(new ut("#3E8BC6"),.28),this.paintDome(),this.sunDiscMat.color.copy(this.sun.color),this.sunDiscMat.opacity=.82,this.sunDisc.position.copy(this.focus).addScaledVector(c,4500),this.sunDisc.lookAt(this.focus),this.sunDisc.visible=Math.sin(o)>.015,this.sunDisc.scale.setScalar(1)}}function Mw(s){const t=Math.floor(s*24*60),e=String(Math.floor(t/60)).padStart(2,"0"),n=String(t%60).padStart(2,"0");return`${e}:${n}`}class Sw{constructor(t){this.el=t,this.camera=new Xe(38,t.clientWidth/Math.max(1,t.clientHeight),.5,9e3),this.apply(),t.addEventListener("pointerdown",n=>{t.setPointerCapture(n.pointerId);const i={x:n.clientX,y:n.clientY};this.pointers.set(n.pointerId,i),this.last.set(n.pointerId,i),this.pointers.size===2&&this.beginPinch()}),t.addEventListener("pointermove",n=>{const i={x:n.clientX,y:n.clientY},r=this.last.get(n.pointerId);if(this.pointers.has(n.pointerId)){if(this.pointers.set(n.pointerId,i),this.last.set(n.pointerId,i),this.pointers.size===1&&r)this.yaw-=(i.x-r.x)*.005,this.pitch=An.clamp(this.pitch+(i.y-r.y)*.004,.35,1.25),this.apply();else if(this.pointers.size>=2){const[a,o]=[...this.pointers.values()],l=Math.hypot(a.x-o.x,a.y-o.y),c=(a.x+o.x)/2,h=(a.y+o.y)/2;this.pinchDist>0&&(this.zoomBy(this.pinchDist/Math.max(1,l)),this.panBy((c-this.mid.x)*.9,(h-this.mid.y)*.9)),this.pinchDist=l,this.mid={x:c,y:h}}}});const e=n=>{if(this.pointers.delete(n.pointerId),this.last.delete(n.pointerId),this.pointers.size<2&&(this.pinchDist=0),this.pointers.size===1){const[i]=[...this.pointers.values()];this.last.set([...this.pointers.keys()][0],{...i})}try{t.releasePointerCapture(n.pointerId)}catch{}};t.addEventListener("pointerup",e),t.addEventListener("pointercancel",e),t.addEventListener("wheel",n=>{n.preventDefault(),this.zoomBy(1+Math.sign(n.deltaY)*.1)},{passive:!1}),window.addEventListener("keydown",n=>{const i=n.key.toLowerCase();["w","a","s","d","q","e","shift","arrowup","arrowdown","arrowleft","arrowright","+","-","="].includes(i)&&(this.keys.add(i),(i.startsWith("arrow")||i===" ")&&n.preventDefault())}),window.addEventListener("keyup",n=>this.keys.delete(n.key.toLowerCase())),window.addEventListener("blur",()=>this.keys.clear()),window.addEventListener("resize",()=>{this.camera.aspect=t.clientWidth/Math.max(1,t.clientHeight),this.camera.updateProjectionMatrix()})}el;camera;target=new I(0,10,0);yaw=An.degToRad(25);pitch=An.degToRad(36);distance=58;pointers=new Map;last=new Map;pinchDist=0;mid={x:0,y:0};keys=new Set;padX=0;padZ=0;padActive=!1;beginPinch(){const[t,e]=[...this.pointers.values()];this.pinchDist=Math.hypot(t.x-e.x,t.y-e.y),this.mid={x:(t.x+e.x)/2,y:(t.y+e.y)/2}}basis(){const t=new I(Math.cos(this.yaw),0,-Math.sin(this.yaw)),e=new I(-Math.sin(this.yaw),0,-Math.cos(this.yaw));return{right:t,forward:e}}panBy(t,e){const n=this.distance*.0016,{right:i,forward:r}=this.basis();this.target.addScaledVector(i,-t*n),this.target.addScaledVector(r,e*n),this.clampTarget(),this.apply()}zoomBy(t){this.distance=An.clamp(this.distance*t,12,1400),this.apply()}setPad(t,e){this.padActive=t!==0||e!==0,this.padX=t,this.padZ=e}clearPad(){this.setPad(0,0),this.padActive=!1}clampTarget(){this.target.x=An.clamp(this.target.x,-1e3,1e3),this.target.z=An.clamp(this.target.z,-1e3,1e3),this.target.y=An.clamp(this.target.y,0,104)}update(t){let e=0,n=0;if((this.keys.has("w")||this.keys.has("arrowup"))&&(n+=1),(this.keys.has("s")||this.keys.has("arrowdown"))&&(n-=1),(this.keys.has("d")||this.keys.has("arrowright"))&&(e+=1),(this.keys.has("a")||this.keys.has("arrowleft"))&&(e-=1),e+=this.padX,n+=this.padZ,this.keys.has("q")&&(this.yaw+=t*1.1),this.keys.has("e")&&(this.yaw-=t*1.1),(this.keys.has("+")||this.keys.has("="))&&this.zoomBy(1-t*1.2),this.keys.has("-")&&this.zoomBy(1+t*1.2),e!==0||n!==0){const i=Math.hypot(e,n)||1,r=An.clamp(this.distance*.55,16,80)*(this.keys.has("shift")?2.2:1),{right:a,forward:o}=this.basis();this.target.addScaledVector(a,e/i*r*t),this.target.addScaledVector(o,n/i*r*t),this.clampTarget(),this.apply()}else(this.keys.has("q")||this.keys.has("e"))&&this.apply()}apply(){const t=this.target.x+this.distance*Math.cos(this.pitch)*Math.sin(this.yaw),e=this.target.y+this.distance*Math.sin(this.pitch),n=this.target.z+this.distance*Math.cos(this.pitch)*Math.cos(this.yaw);this.camera.position.set(t,e,n),this.camera.lookAt(this.target)}setView(t,e,n,i,r,a){this.yaw=An.degToRad(t),this.pitch=An.degToRad(e),this.distance=n,this.target.set(i,r,a),this.apply()}}const Di=new URLSearchParams(location.search),Ie=(s,t)=>Di.has(s)?Number(Di.get(s)):t,Bu=Ie("seed",1337),bw=Di.has("t")?Number(Di.get("t")):.42,ww=Di.get("freeze")==="1",Km=Di.get("scene")??"world",Mr=Km==="kit",Tn=Km==="map",Qm=Di.get("ui")==="0",jm=Math.max(1,Math.min(8,Ie("radius",3))),jr=Di.get("action")??"",Sr=document.getElementById("app"),Aw=document.getElementById("hud"),tg=document.getElementById("controls");Qm&&document.body.classList.add("clean");Mr&&document.body.classList.add("kit");Tn&&document.body.classList.add("map");const en=new Fm({antialias:!0,powerPreference:"high-performance"});en.setPixelRatio(Math.min(devicePixelRatio,2));en.setSize(Sr.clientWidth,Sr.clientHeight);en.toneMapping=zl;en.toneMappingExposure=1.05;en.shadowMap.enabled=!0;en.shadowMap.type=Vh;en.outputColorSpace=cn;Sr.appendChild(en.domElement);const ui=new au,Ve=new Sw(en.domElement),Tw=performance.now(),Pe=x1(Bu,0),eg=-24,ng=-24,Ew=Rr(Pe,eg,ng),zu=18,ku=30,ig=Rr(Pe,zu,ku);Mr?Ve.setView(Ie("yaw",0),Ie("pitch",40),Ie("dist",38),Ie("tx",zu+2),Ie("ty",ig+4),Ie("tz",ku)):Tn?Ve.setView(Ie("yaw",0),Ie("pitch",89),Ie("dist",3300),Ie("tx",0),Ie("ty",8),Ie("tz",0)):Ve.setView(Ie("yaw",38),Ie("pitch",18),Ie("dist",68),Ie("tx",eg),Ie("ty",Ew+5),Ie("tz",ng));const Dn=new J1(Pe,ui,{nearRadius:jm,worldMacroStep:Ie("macro",8),mapMacroStep:Ie("mapmacro",8)});let Tc=!0,sg=0,vi=null;Dn.onChunksChanged=()=>{Tc=!0};Tn?Dn.update(Ve.target,"map"):Dn.preload(Ve.target);const Cw=performance.now()-Tw;function Rw(s){const t=new Set;s.traverse(e=>{const n=e;if(n.isBatchedMesh){n.dispose?.();return}n.isMesh&&n.geometry&&!t.has(n.geometry)&&(t.add(n.geometry),n.geometry.dispose())})}function Vu(){vi&&(ui.remove(vi),Rw(vi),vi=null);const s=lw(Pe,Dn.loadedChunkKeys);vi=s.group,vi.visible=!Tn,sg=s.instances,ui.add(vi),Tc=!1}Vu();const Ec=new vn;Ec.name="noxel_sites";for(const s of Pe.sites)Ec.add(xw(s));Ec.visible=!Tn;ui.add(Ec);let Zr=null;if(Mr){Zr=new vn,Zr.name="noxel_integration_test",Zr.position.set(zu,ig,ku);for(const s of yw())Zr.add(s);ui.add(Zr)}const Fl=new vw(ui,en);Fl.fogScale=Tn?0:.55;const Wn={t:bw,dayLengthSec:600,paused:ww};let ta=1;Tn&&(ui.fog=null);Fl.setFocus(Ve.target);let Zi="";function rg(s,t,e=2,n=3){let i=0;for(let r=t-e;r<=t+e;r++)for(let a=s-e;a<=s+e;a++){const o=Rr(Pe,a,r);for(let l=o-1;l>=o-n;l--)km(Pe,a,l,r,Pt.AIR)&&i++}return Dn.rebuildAround(s,t),i}function Iw(s,t){const e=Rr(Pe,s,t),n=km(Pe,s,e,t,Pt.STONE);return Dn.rebuildAround(s,t),n}function ag(s=!1){const t=N1(Pe,Ve.target.x,Ve.target.z,40,"wood");if(!t)return null;let e=0,n="";do{const i=U1(Pe,t.id);if(!i||(e+=i.amount,n=i.resource,!s))break}while(!t.harvested);return Zi=`harvested ${e} ${n} from ${t.kind.replace("styl_","").replace(/_/g," ")}`+(t.harvested?" (depleted)":""),Tc=!0,t}function Pw(){(jr==="dig"||jr==="both")&&(Zi=`excavated ${rg(0,-18,2,3)} voxels`),(jr==="harvest"||jr==="both")&&ag(!0),Vu()}const Lw=tg.querySelectorAll("[data-pad]");for(const s of Lw){const[t,e]=(s.dataset.pad??"0,0").split(",").map(Number),n=r=>{r.preventDefault(),s.setPointerCapture(r.pointerId),Ve.setPad(t,e)},i=()=>Ve.clearPad();s.addEventListener("pointerdown",n),s.addEventListener("pointerup",i),s.addEventListener("pointercancel",i),s.addEventListener("lostpointercapture",i)}for(const s of tg.querySelectorAll("[data-zoom]"))s.addEventListener("pointerdown",t=>{t.preventDefault(),Ve.zoomBy(s.dataset.zoom==="in"?.85:1.18)});if(Mr){const s=document.createElement("div");s.id="kit-panel",s.innerHTML='<strong>VOXEL + NOXEL — INTEGRATION TEST</strong><span class="warn">PROVISIONAL · owner Noxel reference images not supplied</span><dl><dt>Post</dt><dd>1.2 × 4.8 × 1.2 m · 3 volumes · 0.4 m slab base</dd><dt>Wall panel</dt><dd>4.0 × 0.4 × 1.2 m foundation · 3.2 m storey · 0.3 m parapet</dd><dt>Gateway</dt><dd>6.0 m lintel · 4.8 m posts · two 1.6 m caps</dd><dt>Stair</dt><dd>4 × 0.3 m risers · 0.9 m treads · 2.0 m landing</dd><dt>Waystone</dt><dd>7.8 m · 8 volumes · forked landmark</dd></dl><p>Terrain: chunked 1 m voxel volume · 32 × 32 × 128 chunks · greedy 3D mesher. The shelf is authoritative voxel state, not a render-only plane.</p>',Sr.appendChild(s)}if(Tn){const s=document.createElement("div");s.id="map-north",s.textContent="N ↑",Sr.appendChild(s);const t=document.createElement("div");t.id="map-panel",t.innerHTML="<strong>WORLD MAP — 2048 × 2048 m</strong><p>N ↑ · Founder valley (centre) · Eastwood forest (E) · Crown highlands (NW) · Mirror lake (NW) · river to the sea · broken coast all round. 1 m voxels near the player; 8 m macro LOD for this map.</p>",Sr.appendChild(t)}function og(){let s=0;for(const e of Pe.edits.values())s+=e.size;let t=0;for(const e of Pe.entities.values())e.harvestedOnce&&t++;return{seed:Bu,worldSize:Rs,chunkSize:zt,nearRadius:jm,seaLevel:Oe,loadedChunks:Dn.loadedChunks,cachedChunks:Pe.chunks.size,chunksGenerated:Pe.stats.chunksGenerated,generationMs:Math.round(Pe.stats.generationMs*10)/10,initialLoadMs:Math.round(Cw),entities:Pe.entities.size,trees:Pe.stats.trees,pinkTrees:Pe.stats.pinkTrees,pinkOverflow:Pe.stats.pinkOverflow,natureInstances:sg,edits:s,harvested:t,inventory:{...Pe.inventory},nearTriangles:Dn.nearTriangles,macroTriangles:Dn.macroTriangleCount,rendererCalls:en.info.render.calls,rendererTriangles:en.info.render.triangles,rendererGeometries:en.info.memory.geometries,rendererTextures:en.info.memory.textures,streamPerf:Dn.streamPerf,lastAction:Zi}}window.__metrics=og();const Dw=new Am;let ko=0;const Nw=matchMedia("(pointer: coarse)").matches;function lg(){const s=Math.min(Dw.getDelta(),.1);F1(Wn,s*ta),Ve.update(s),Fl.setFocus(Ve.target),Fl.update(Wn.t),Tn&&(ui.fog=null);const t=Tn?"map":Mr?"kit":"world";if(Dn.update(Ve.target,t),Tc&&!Tn&&ko%2===0&&Vu(),vi&&(vi.visible=!Tn),en.render(ui,Ve.camera),ko%6===0&&(window.__metrics=og(),!Qm&&!Tn&&!Mr)){const e=window.__metrics,n=Nw?"drag: orbit · two fingers: move + zoom · pad: walk":"drag: orbit · WASD: move · wheel: zoom · F: dig · G: place · H: harvest · space: pause";Aw.innerHTML=`<strong>ASTrix — World Foundation</strong> · M001 — seed ${Bu} · ${Rs} × ${Rs} m · 1 m voxels<br>${Mw(Wn.t)} · ${Wn.paused?"paused":"day "+Math.round(Wn.dayLengthSec)+"s"} · ${e.loadedChunks} chunks · ${e.natureInstances} natural assets · ${e.rendererTriangles.toLocaleString()} tris<br><span class="dim">${Zi?Zi+" · ":""}${n}</span>`}ko++,ko===3&&(window.__ready=!0),requestAnimationFrame(lg)}window.addEventListener("keydown",s=>{s.code==="Space"&&(Wn.paused=!Wn.paused,s.preventDefault()),s.key==="1"&&(Wn.t=.22),s.key==="2"&&(Wn.t=.5),s.key==="3"&&(Wn.t=.78),s.key==="4"&&(Wn.t=0),s.key==="]"&&(ta=Math.min(24,ta*2)),s.key==="["&&(ta=Math.max(.25,ta/2)),(s.key==="f"||s.key==="F")&&(Zi=`excavated ${rg(Math.round(Ve.target.x),Math.round(Ve.target.z),2,3)} voxels`),(s.key==="g"||s.key==="G")&&(Zi=Iw(Math.round(Ve.target.x),Math.round(Ve.target.z))?"placed a stone voxel":"no voxel change"),(s.key==="h"||s.key==="H")&&(ag()||(Zi="no harvestable tree within 40 m"))});jr&&Pw();window.__probe={renderer:en,camera:Ve.camera};Di.get("debug")==="1"&&(Object.assign(window.__probe,{THREE:d1,terrainView:Dn}),window.__scene=ui,window.__world=Pe);requestAnimationFrame(lg);
