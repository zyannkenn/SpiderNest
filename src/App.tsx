import React,{useEffect,useRef,useState} from 'react';
import {Alert,BackHandler,Platform,Pressable,ScrollView,StatusBar,StyleSheet,Text,TextInput,View} from 'react-native';
import {SafeAreaProvider,SafeAreaView} from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import Storage from './browserStorage';
import * as Picker from 'expo-image-picker';
import {CameraView,useCameraPermissions} from 'expo-camera';
import {File,Paths} from 'expo-file-system';
import * as Media from 'expo-media-library';
import {captureRef,releaseCapture} from 'react-native-view-shot';
import {Scene} from './Scene';
import {downloadPreview} from './webImage';
import {clamp,Design,initialQuad,newDesign,Pattern,patterns,Photo,Quad,validQuad,webDefaults} from './model';

const isWeb=Platform.OS==='web';
function notify(title:string,message?:string){
  if(isWeb)window.alert(message ? title+'\n'+message : title);
  else Alert.alert(title,message);
}
async function persistentPhoto(photo:Photo):Promise<Photo>{
  if(!isWeb||photo.uri.startsWith('data:'))return photo;
  const blob=await (await fetch(photo.uri)).blob();
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve({...photo,uri:String(reader.result)});
    reader.onerror=()=>reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
const purple='#6842D8', ink='#20202A';
const steps=['撮影','配置','デザイン','確認','生成'];
const titles=['部屋の角を選ぶ','フレームを配置','蜘蛛の巣をデザイン','完成プレビュー','ロボット生成'];
const sample=newDesign();
const storageKey='spidernest.designs.v1';
function Button({label,onPress,primary=false,disabled=false}:{label:string;onPress:()=>void;primary?:boolean;disabled?:boolean}){
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
    style={({pressed})=>[s.button,primary&&s.primary,(pressed||disabled)&&{opacity:.55}]}>
    <Text style={[s.buttonText,primary&&{color:'white'}]}>{label}</Text>
  </Pressable>;
}
function Range({label,value,min=0,max=100,change}:{label:string;value:number;min?:number;max?:number;change:(n:number)=>void}){
  return <View><Text style={s.label}>{label}　{value}</Text><Slider accessibilityLabel={label} value={value}
    minimumValue={min} maximumValue={max} step={1} onValueChange={change} minimumTrackTintColor={purple} thumbTintColor={purple}/></View>;
}
export default function App(){return <SafeAreaProvider><Studio/></SafeAreaProvider>;}
function Studio(){
  const [page,setPage]=useState(0);
  const [design,setDesign]=useState(newDesign);
  const [saved,setSaved]=useState<Design[]>([]);
  const [loaded,setLoaded]=useState(false);
  const [library,setLibrary]=useState<'saved'|'templates'|'settings'|null>(null);
  const [frame,setFrame]=useState(true);
  const [camera,setCamera]=useState(false);
  const [cameraReady,setCameraReady]=useState(false);
  const [permission,requestPermission]=useCameraPermissions();
  const [busy,setBusy]=useState(false);
  const [imageReady,setImageReady]=useState(false);
  const [progress,setProgress]=useState(-1);
  const photoView=useRef<View>(null);
  const cameraView=useRef<CameraView>(null);
  const lock=useRef(false);
  const scroll=useRef<ScrollView>(null);
  const patch=(next:Partial<Design>)=>setDesign(current=>({...current,...next}));
  const back=()=>{
    if(busy)return true;
    if(camera){setCamera(false);return true;}
    if(library){setLibrary(null);return true;}
    if(page){setPage(page-1);return true;}
    return false;
  };
  useEffect(()=>{
    const sub=BackHandler.addEventListener('hardwareBackPress',back);
    return ()=>sub.remove();
  });
  useEffect(()=>{scroll.current?.scrollTo({y:0,animated:false});if(page!==5)setProgress(-1);},[page,library]);
  useEffect(()=>{
    Storage.getItem(storageKey).then(raw=>{if(raw)setSaved(JSON.parse(raw));setLoaded(true);})
      .catch(()=>notify('保存データを読み込めませんでした'));
  },[]);
  useEffect(()=>{
    if(page!==5||progress<0||progress>=100)return;
    const timer=setTimeout(()=>setProgress(p=>Math.min(100,p+5)),320);
    return ()=>clearTimeout(timer);
  },[page,progress]);
  async function run(action:()=>Promise<void>){
    if(lock.current)return;
    lock.current=true;
    setBusy(true);
    try{await action();}catch(e){notify('操作を完了できませんでした',e instanceof Error?e.message:String(e));}
    finally{lock.current=false;setBusy(false);}
  }
  const usePhoto=(photo:Photo)=>{setImageReady(false);patch({photo,quad:initialQuad()});};
  const begin=(pattern?:Pattern)=>{
    setDesign(newDesign(pattern));setFrame(true);setImageReady(false);setLibrary(null);setPage(1);
  };
  const open=(d:Design)=>{
    setDesign(d);setFrame(true);setImageReady(false);setLibrary(null);setPage(4);
  };
  const dimensionsValid=[design.widthCm,design.heightCm].every(v=>/^\d+(?:\.\d*)?$|^\.\d+$/.test(v.trim())&&Number.isFinite(Number(v))&&Number(v)>0);
  const save=()=>run(async()=>{
    if(!loaded)throw Error('保存データの読み込みを確認してください。');
    let photo=design.photo;
    let copied:File|undefined;
    if(photo&&!isWeb&&!photo.uri.startsWith(Paths.document.uri)){
      const source=new File(photo.uri);
      copied=new File(Paths.document,design.id+'-'+Date.now()+source.extension);
      source.copy(copied);
      photo={...photo,uri:copied.uri};
    }
    const next={...design,photo,name:design.name.trim()||'名称未設定',updatedAt:new Date().toISOString()};
    const list=[next,...saved.filter(d=>d.id!==next.id)];
    try{await Storage.setItem(storageKey,JSON.stringify(list));}
    catch(e){if(copied?.exists)copied.delete();throw e;}
    setSaved(list);
    setDesign(current=>({...current,photo:current.photo===design.photo?photo:current.photo,
      name:current.name===design.name?next.name:current.name,updatedAt:next.updatedAt}));
    notify('デザインを保存しました');
  });
  const resize=(factor:number)=>{
    const x=design.quad.reduce((sum,p)=>sum+p.x,0)/4;
    const y=design.quad.reduce((sum,p)=>sum+p.y,0)/4;
    const quad=design.quad.map(p=>({x:x+(p.x-x)*factor,y:y+(p.y-y)*factor})) as Quad;
    if(quad.every(p=>clamp(p.x)===p.x&&clamp(p.y)===p.y)&&validQuad(quad))patch({quad});
  };
  const exportImage=()=>run(async()=>{
    if(isWeb){
      await downloadPreview(photoView.current);
      return;
    }
    const access=await Media.requestPermissionsAsync(true);
    if(!access.granted)throw Error('設定から写真の追加を許可してください。');
    if(!photoView.current)throw Error('プレビューを表示してください。');
    const uri=await captureRef(photoView,{format:'png',result:'tmpfile'});
    try{await Media.saveToLibraryAsync(uri);}finally{releaseCapture(uri);}
    notify('完成画像を写真に保存しました');
  });
  return <SafeAreaView style={s.safe}><StatusBar barStyle="dark-content"/>
    {camera?<View style={s.camera}>
      <CameraView ref={cameraView} style={StyleSheet.absoluteFill} onCameraReady={()=>setCameraReady(true)}
        onMountError={e=>{setCamera(false);notify('カメラを開けませんでした',e.message);}}/>
      <View pointerEvents="none" style={s.guide}><Text style={s.cameraText}>2つの壁の境界が見えるように撮影してください</Text><View style={s.guideLine}/></View>
      <View style={s.cameraActions}><Button label="戻る" disabled={busy} onPress={()=>setCamera(false)}/>
        <Button primary label="撮影する" disabled={busy||!cameraReady} onPress={()=>run(async()=>{
          const photo=await cameraView.current?.takePictureAsync({quality:.85});
          if(photo){usePhoto(await persistentPhoto(photo));setCamera(false);}
        })}/></View>
    </View>:<>
      <View style={s.header}>
        {(page>0||library)&&<Pressable accessibilityRole="button" accessibilityLabel="戻る" onPress={back} style={s.back}><Text style={s.backText}>‹</Text></Pressable>}
        <Text style={s.brand}>SpiderNest</Text>
        {page===0&&!library&&<Pressable onPress={()=>setLibrary('settings')} style={s.back} accessibilityRole="button" accessibilityLabel="設定"><Text style={s.backText}>⚙</Text></Pressable>}
      </View>
      {page>0&&<View style={s.steps}>{steps.map((step,i)=><View key={step} style={s.step}>
        <View style={[s.stepBar,i<page&&{backgroundColor:purple}]}/><Text style={[s.small,i===page-1&&{color:purple,fontWeight:'700'}]}>{step}</Text>
      </View>)}</View>}
      <ScrollView ref={scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {page===0&&!library&&<>
          <Text style={s.eyebrow}>INTERIOR DESIGN STUDIO</Text>
          <Text style={s.hero}>部屋のすみから、{'\n'}あなただけの巣を。</Text>
          <Scene design={sample} robot/>
          <Button primary label="＋ 新しくデザインする" onPress={()=>begin()}/>
          <View style={s.row}><Button label="保存したデザイン" onPress={()=>setLibrary('saved')}/><Button label="テンプレート" onPress={()=>setLibrary('templates')}/></View>
          <Text style={s.section}>最近のデザイン</Text>
          {!saved.length&&<Text style={s.note}>保存したデザインがここに表示されます。</Text>}
          {saved.slice(0,3).map(d=><Button key={d.id} label={d.name+'　›'} onPress={()=>open(d)}/>)}
        </>}
        {library==='saved'&&<><Text style={s.title}>保存したデザイン</Text>
          {!saved.length&&<Text style={s.note}>保存済みのデザインはありません。</Text>}
          {saved.map(d=><Button key={d.id} label={d.name+'　·　'+d.pattern+'　›'} onPress={()=>open(d)}/>)}</>}
        {library==='templates'&&<><Text style={s.title}>テンプレート</Text>{patterns.map(pattern=><View key={pattern} style={s.card}>
          <Scene design={{...sample,pattern}}/><Button label={pattern+'を使う'} onPress={()=>begin(pattern)}/>
        </View>)}</>}
        {library==='settings'&&<><Text style={s.title}>設定</Text><View style={s.card}>
          <Text style={s.label}>SpiderNest MVP</Text><Text style={s.note}>写真とデザインは端末内に保存されます。生成はデモモードです。</Text>
        </View></>}
        {page>0&&<><Text style={s.eyebrow}>STEP 0{page} / 05</Text><Text style={s.title}>{titles[page-1]}</Text></>}
        {page===1&&<>
          <Text style={s.note}>2つの壁の境界が見えるように撮影してください。</Text>
          <Scene design={design} frame={false} web={false}/>
          {!design.photo&&<Text style={s.small}>部屋の角のサンプルイメージ</Text>}
          <Button primary label={design.photo?'撮り直す':'カメラで撮影'} disabled={busy} onPress={()=>run(async()=>{
            const access=permission?.granted?permission:await requestPermission();
            if(!access.granted)throw Error('設定からカメラを許可してください。');
            setCameraReady(false);setCamera(true);
          })}/>
          <Button label="フォトライブラリから選ぶ" disabled={busy} onPress={()=>run(async()=>{
            const result=await Picker.launchImageLibraryAsync({mediaTypes:['images'],quality:.85});
            if(!result.canceled)usePhoto(await persistentPhoto(result.assets[0]));
          })}/>
        </>}
        {page===2&&<>
          <Text style={s.note}>左の2点を左壁、右の2点を右壁に合わせます。中央をドラッグすると全体を移動できます。</Text>
          <Scene design={design} web={false} edit={quad=>patch({quad})}/>
          <View style={s.row}><Button label="− 縮小" onPress={()=>resize(.9)}/><Button label="＋ 拡大" onPress={()=>resize(1.1)}/><Button label="配置をリセット" onPress={()=>patch({quad:initialQuad()})}/></View>
          <View style={s.card}><Text style={s.section}>フレームの実寸</Text><Text style={s.note}>実際に測った横幅と高さを cm で入力します。</Text>
            <View style={s.row}>{(['widthCm','heightCm'] as const).map((key,i)=><View key={key} style={s.flex}><Text style={s.label}>{i?'高さ':'横幅'}（cm）</Text>
              <TextInput accessibilityLabel={i?'高さ cm':'横幅 cm'} keyboardType="decimal-pad" style={s.input} value={design[key]} onChangeText={v=>patch({[key]:v.replace(',','.')})}/></View>)}</View>
            <Button label="配置を保存" disabled={busy||!dimensionsValid} onPress={save}/>
          </View>
        </>}
        {page===3&&<>
          <Scene design={design}/>
          <View style={s.card}><Text style={s.section}>パターン</Text><View style={s.row}>{patterns.map(pattern=><Button key={pattern} label={pattern} primary={pattern===design.pattern} onPress={()=>patch({pattern})}/>)}</View>
          <Range label="糸の密度 %" value={design.density} change={density=>patch({density})}/>
          <Range label="放射糸の本数" min={4} max={32} value={design.spokes} change={spokes=>patch({spokes})}/>
          <Range label="配置バランス" value={design.balance} change={balance=>patch({balance})}/>
          <Range label="中心の左右 %" min={10} max={90} value={Math.round(design.center.x*100)} change={x=>patch({center:{...design.center,x:x/100}})}/>
          <Range label="中心の上下 %" min={10} max={90} value={Math.round(design.center.y*100)} change={y=>patch({center:{...design.center,y:y/100}})}/>
          <Text style={s.label}>プレビューの糸の色</Text><View style={s.row}>{[['白','#F6F1FF'],['藤','#BC9BFF'],['金','#F9D692'],['墨','#292338']].map(([label,color])=><Button key={color} label={label} primary={color===design.color} onPress={()=>patch({color})}/>)}</View>
          <Button label="デザインをリセット" onPress={()=>patch({...webDefaults,pattern:patterns[0]})}/>
          <Text style={s.note}>装飾プレビューです。実機用の糸張り経路は別のデータとして管理します。</Text></View>
        </>}
        {page===4&&<>
          <Scene key={design.photo?.uri} design={design} frame={frame} capture={photoView} onImageReady={setImageReady}/>
          <View style={s.row}><Button label={frame?'フレームを隠す':'フレームを表示'} onPress={()=>setFrame(v=>!v)}/><Button label="デザインを再編集" onPress={()=>setPage(3)}/></View>
          <View style={s.card}><Text style={s.label}>デザイン名</Text><TextInput accessibilityLabel="デザイン名" maxLength={60} value={design.name} onChangeText={name=>patch({name})} style={s.input}/>
            <Button label="デザインを保存" disabled={busy} onPress={save}/>
            <Button label="画像として保存" disabled={busy||!!design.photo&&!imageReady} onPress={exportImage}/>
          </View>
        </>}
        {page===5&&<>
          <View style={s.card}><Text style={s.eyebrow}>デモモード</Text><Text style={s.note}>アプリ内で生成の流れをシミュレーションします。</Text>
            <Text style={s.section}>{design.name.trim()||'名称未設定'}</Text>
            <Text style={s.label}>{design.widthCm} × {design.heightCm} cm　·　{design.pattern}</Text>
            <Text style={s.label}>放射糸 {design.spokes}本　·　密度 {design.density}%</Text>
            <Text style={s.label}>使用する糸</Text>
            <View style={s.row}>{['透明糸','白色糸'].map(thread=><Button key={thread} label={thread} primary={design.thread===thread} disabled={progress>=0&&progress<100} onPress={()=>patch({thread})}/>)}</View>
          </View>
          <View style={s.card}><Text style={s.section}>{progress<0?'開始待ち':progress===100?'デモ生成完了':'生成中'}　{Math.max(progress,0)}%</Text>
            <View accessibilityRole="progressbar" accessibilityValue={{min:0,max:100,now:Math.max(progress,0)}} style={s.track}><View style={[s.progress,{width:`${Math.max(progress,0)}%`}]}/></View>
            {progress>=0&&progress<100&&<Text style={s.note}>{progress<25?'固定点を確認中':progress<85?'糸を張っています':'仕上げ中'}</Text>}
          </View>
        </>}
      </ScrollView>
      {page>0&&<View style={s.footer}><Button primary disabled={busy||(page===1&&!design.photo)||(page===2&&!dimensionsValid)||(page===5&&progress>=0&&progress<100)}
        label={['配置へ進む','デザインへ進む','完成イメージを確認','生成デモへ進む',progress===100?'もう一度デモを実行':progress>=0?'生成中…':'デモ生成を開始'][page-1]}
        onPress={()=>page===5?setProgress(0):setPage(page+1)}/></View>}
    </>}
  </SafeAreaView>;
}
const s=StyleSheet.create({
  safe:{flex:1,backgroundColor:'#FFFFFF'},header:{paddingHorizontal:20,minHeight:54,flexDirection:'row',alignItems:'center',gap:10},
  brand:{fontSize:23,fontWeight:'800',letterSpacing:-.9,color:ink,flex:1},back:{minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center'},
  backText:{color:purple,fontSize:29},content:{padding:20,gap:14,paddingBottom:24,width:'100%',maxWidth:640,alignSelf:'center'},
  eyebrow:{color:purple,fontWeight:'800',fontSize:11,letterSpacing:2},hero:{fontWeight:'800',fontSize:32,color:ink,lineHeight:44},
  title:{fontSize:28,fontWeight:'800',color:ink},section:{fontSize:17,fontWeight:'800',color:ink},label:{color:ink,fontWeight:'600'},
  note:{fontSize:14,color:'#60596C',lineHeight:22},small:{fontSize:11,color:'#655F70'},row:{flexDirection:'row',gap:8,flexWrap:'wrap'},flex:{flex:1},
  card:{backgroundColor:'#F6F6F8',padding:15,borderRadius:18,gap:12},button:{minHeight:46,justifyContent:'center',alignItems:'center',paddingHorizontal:13,paddingVertical:10,borderRadius:13,backgroundColor:'#EEE8FF'},
  primary:{backgroundColor:purple},buttonText:{color:purple,fontSize:14,fontWeight:'700',textAlign:'center'},
  steps:{flexDirection:'row',gap:8,paddingHorizontal:20,paddingBottom:8},step:{flex:1,gap:5},stepBar:{height:3,borderRadius:3,backgroundColor:'#EEE8FF'},
  input:{padding:12,borderRadius:10,backgroundColor:'white',borderWidth:1,borderColor:'#DDD8E7',color:ink,minHeight:46},
  footer:{paddingHorizontal:20,paddingVertical:9,borderTopWidth:StyleSheet.hairlineWidth,borderColor:'#DDD8E7',width:'100%',maxWidth:640,alignSelf:'center'},
  track:{height:9,backgroundColor:'#EEE8FF',borderRadius:8,overflow:'hidden'},progress:{height:9,backgroundColor:purple},
  camera:{flex:1,backgroundColor:'#252231'},guide:{flex:1,alignItems:'center',padding:18},guideLine:{width:1,flex:1,borderWidth:1,borderStyle:'dashed',borderColor:'white',marginVertical:25},
  cameraText:{backgroundColor:'#20202ACC',color:'white',borderRadius:10,padding:12,textAlign:'center'},
  cameraActions:{flexDirection:'row',justifyContent:'center',gap:16,padding:20},
});
