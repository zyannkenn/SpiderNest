import React, {useEffect,useMemo,useRef,useState} from 'react';
import {Image, PanResponder, Platform, StyleSheet, View} from 'react-native';
import Svg,{Circle,Defs,LinearGradient,Stop,Polygon,Polyline,Path,Rect} from 'react-native-svg';
import {clamp,Design,project,Quad,validQuad,webLines} from './model';

const webDragStyle = {...StyleSheet.absoluteFillObject, touchAction: "none"};
type Props={design:Design; frame?:boolean; web?:boolean; edit?:(q:Quad)=>void; capture?:React.Ref<View>; robot?:boolean; onImageReady?:(ready:boolean)=>void};
export function Scene({design,frame=true,web=true,edit,capture,robot,onImageReady}:Props){
  const [width,setWidth]=useState(0);
  const photo=design.photo;
  const uri=photo?.uri;
  const [decoded,setDecoded]=useState<{uri:string;ratio:number}|null>(null);
  useEffect(()=>{
    if(!uri)return;
    let active=true;
    Image.getSize(uri,(w,h)=>{
      if(active&&w>0&&h>0)setDecoded({uri,ratio:h/w});
    },()=>{});
    return ()=>{active=false;};
  },[uri]);
  const ratio=decoded&&decoded.uri===uri?decoded.ratio:photo&&photo.width>0&&photo.height>0?photo.height/photo.width:.88;
  const height=width*Math.min(1.4,ratio);
  const imageWidth=Math.min(width,height/ratio);
  const imageHeight=imageWidth*ratio;
  const live=useRef({quad:design.quad,edit,imageWidth,imageHeight});
  live.current={quad:design.quad,edit,imageWidth,imageHeight};
  const start=useRef<{q:Quad; corner:number}|null>(null);
  const pan=useMemo(()=>PanResponder.create({
    onStartShouldSetPanResponder:()=>!!live.current.edit,
    onPanResponderGrant:e=>{
      const {locationX:x,locationY:y}=e.nativeEvent;
      const {quad:q,imageWidth:w,imageHeight:h}=live.current;
      const corner=q.findIndex(p=>Math.hypot(p.x*w-x,p.y*h-y)<26);
      const inside=q.every((a,i)=>{
        const b=q[(i+1)%4];
        return (b.x-a.x)*(y/h-a.y)-(b.y-a.y)*(x/w-a.x)>=0;
      });
      start.current=corner>=0||inside?{q,corner}:null;
    },
    onPanResponderMove:(_,g)=>{
      if(!start.current)return;
      const {q,corner}=start.current;
      const {imageWidth:w,imageHeight:h,edit:change}=live.current;
      let dx=g.dx/w,dy=g.dy/h;
      if(corner<0){
        dx=clamp(dx,-Math.min(...q.map(p=>p.x)),1-Math.max(...q.map(p=>p.x)));
        dy=clamp(dy,-Math.min(...q.map(p=>p.y)),1-Math.max(...q.map(p=>p.y)));
      }
      const next=q.map((p,i)=>corner<0||corner===i?{x:clamp(p.x+dx),y:clamp(p.y+dy)}:p) as Quad;
      if(validQuad(next))change?.(next);
    },
    onPanResponderRelease:()=>{start.current=null;},
    onPanResponderTerminate:()=>{start.current=null;},
  }),[]);
  const points=(ps:Quad|{x:number;y:number}[])=>ps.map(p=>[p.x*imageWidth,p.y*imageHeight].join(',')).join(' ');
  const polygon=points(design.quad);
  return <View ref={capture} collapsable={false} onLayout={e=>setWidth(e.nativeEvent.layout.width)}
    style={{height:height||300,backgroundColor:'#252231',borderRadius:18,overflow:'hidden',alignItems:'center',justifyContent:'center'}}>
    {width>0&&<View style={{width:imageWidth,height:imageHeight}}>
      {photo&&<Image key={photo.uri} source={{uri:photo.uri}} resizeMode="contain" style={StyleSheet.absoluteFill}
        onLoadStart={()=>onImageReady?.(false)} onLoad={()=>onImageReady?.(true)} onError={()=>onImageReady?.(false)}/>}
      <View pointerEvents="none" style={styles.overlay}>
      <Svg width={imageWidth} height={imageHeight} pointerEvents="none">
        {!photo&&<Svg width={imageWidth} height={imageHeight} viewBox="0 0 400 352">
          <Defs><LinearGradient id="wall" x1="0" x2="1" y1="0" y2="1">
            <Stop offset="0" stopColor="#AAA08F"/><Stop offset="1" stopColor="#4E4141"/>
          </LinearGradient></Defs>
          <Rect width="400" height="352" fill="url(#wall)"/>
          <Path d="M210 0H400V301L210 335Z" fill="#756666"/>
          <Path d="M0 287L210 335L400 301V352H0Z" fill="#473932"/>
          <Path d="M0 32L166 4L122 294L0 268Z" fill="#E4D0AC" opacity=".22"/>
          <Path d="M28 348Q43 297 21 264M37 348Q22 315 8 309M37 348Q50 313 62 307" stroke="#A4AB85" strokeWidth="5" fill="none"/>
          {robot&&<><Path d="M308 264l-17 -11 -16 6m35 8l-20 -2 -16 12m36 -5l-19 6 -9 14m30 -17l-8 12 -4 12m17 -35l13 -13 18 3m-29 15l19 -4 14 9m-34 0l18 3 12 13m-31 -12l8 12 6 9" stroke="#292338" strokeWidth="3" fill="none"/><Circle cx="313" cy="271" r="12" fill="#322843"/><Circle cx="314" cy="260" r="6" fill="#504263"/></>}
        </Svg>}
        {frame&&<Polygon points={polygon} fill={edit?'#6842D8':'none'} fillOpacity={.12} stroke={edit?'#A381FF':'#32283D'} strokeWidth={edit?3:4} strokeLinejoin="round"/>}
        {web&&webLines(design).map((line,i)=><Polyline key={i} points={points(line.map(p=>project(design.quad,p)))} stroke={design.color} strokeWidth={i<design.spokes?1.25:.85} opacity={.88} fill="none"/>)}
        {edit&&design.quad.map((p,i)=><Circle key={i} cx={p.x*imageWidth} cy={p.y*imageHeight} r={8} fill="#6842D8" stroke="white" strokeWidth={2}/>)}
      </Svg>
      </View>
      {!!edit&&<View style={[styles.gesture,Platform.OS==='web'&&webDragStyle]} {...pan.panHandlers}/>}
    </View>}
  </View>;
}

const styles=StyleSheet.create({
  overlay:{...StyleSheet.absoluteFillObject,zIndex:1},
  gesture:{...StyleSheet.absoluteFillObject,zIndex:2},
});
