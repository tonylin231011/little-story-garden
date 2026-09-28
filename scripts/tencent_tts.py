"""Offline Tencent TTS pack builder. Credentials are read from the environment only."""
import argparse,base64,hashlib,json,os,sys,time,uuid
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from threading import Lock
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools/tencent'))
PROFILES={
 'xiaorou':{'id':502001,'name':'智小柔 · 超自然女声','tier':'超自然大模型'},
 'winny':{'id':501009,'name':'WeWinny · 英语女声','tier':'大模型'},
 'xiaoduo':{'id':403000,'name':'云小朵 · 超自然童声','tier':'超自然大模型'},
}
SAMPLE='Can you see me? Can you find the box? You found me!'
OUT=ROOT/'public/audio'
LOCK=Lock()
def save_json(path,obj):
 path.parent.mkdir(parents=True,exist_ok=True)
 temp=path.with_suffix(path.suffix+'.tmp')
 temp.write_text(json.dumps(obj,ensure_ascii=False,indent=2),encoding='utf-8')
 temp.replace(path)
def collect(lesson):
 texts={}
 def add(text,role='narrator'):
  if text:texts[role+'|'+text]=text
 for page in lesson['pages']:
  for seg in page['read_aloud']['segments']:add(seg['text'],seg.get('voice','narrator'))
  for h in page.get('hotspots',[]):add(h['label'])
 for a in [a for p in lesson['pages'] for a in p['activities']]+lesson['review']:
  if a.get('enabled') is False or a.get('reviewed') is False:continue
  add(a.get('tts') or a['prompt'])
  for c in a.get('choices',[]):add(c['text'])
  for text in a.get('feedback',{}).values():add(text)
  if a.get('teach_word'):add(a['teach_word']['word'])
 for text in ["Let's look again.","Well done!","Let's try together.","You found it!","You did it! A story star for you."]:add(text)
 return texts
def spec(voice,text):
 return {'Text':text,'VoiceType':PROFILES[voice]['id'],'Speed':-0.3,'Volume':0,'PrimaryLanguage':2,'SampleRate':24000,'Codec':'mp3','ModelType':1}
def audio_path(voice,text):
 digest=hashlib.sha256(json.dumps(spec(voice,text),sort_keys=True).encode()).hexdigest()[:24]
 return OUT/'tencent'/f'{digest}.mp3'
def main():
 ap=argparse.ArgumentParser()
 ap.add_argument('--preview',action='store_true')
 ap.add_argument('--dry-run',action='store_true')
 ap.add_argument('--voices',nargs='+',choices=list(PROFILES),default=['xiaorou','winny'])
 ap.add_argument('--max-characters',type=int,default=10000)
 ap.add_argument('--lesson',type=Path,default=ROOT/'public/lesson.json')
 args=ap.parse_args()
 lesson=json.loads(args.lesson.read_text(encoding='utf-8-sig'))
 texts={'narrator|'+SAMPLE:SAMPLE} if args.preview else collect(lesson)
 unique=list(dict.fromkeys(texts.values()))
 if any(len(t)>500 for t in unique):raise ValueError('A sentence exceeds the 500-character API limit.')
 jobs=[(v,t) for v in args.voices for t in unique if not audio_path(v,t).exists()]
 chars=sum(len(t) for _,t in jobs)
 print(json.dumps({'mode':'preview' if args.preview else 'full','voices':args.voices,'unique_texts':len(unique),'requests_needed':len(jobs),'characters_upper_bound':chars},ensure_ascii=True),flush=True)
 if chars>args.max_characters:raise ValueError('Requested text exceeds the configured character cap.')
 if args.dry_run:return
 if not os.environ.get('TENCENT_SECRET_ID') or not os.environ.get('TENCENT_SECRET_KEY'):
  raise ValueError('Set TENCENT_SECRET_ID and TENCENT_SECRET_KEY in the process environment.')
 from tencentcloud.common import credential
 from tencentcloud.common.profile.http_profile import HttpProfile
 from tencentcloud.common.profile.client_profile import ClientProfile
 from tencentcloud.tts.v20190823 import tts_client,models
 cred=credential.Credential(os.environ['TENCENT_SECRET_ID'],os.environ['TENCENT_SECRET_KEY'])
 OUT.joinpath('tencent').mkdir(parents=True,exist_ok=True)
 ledger_path=ROOT/'tts-usage.json'
 ledger=json.loads(ledger_path.read_text(encoding='utf-8')) if ledger_path.exists() else {'requests':[]}
 def run(job):
  voice,text=job;target=audio_path(voice,text)
  record={'voice':voice,'characters':len(text),'file':target.name,'status':'reserved','at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}
  with LOCK:ledger['requests'].append(record);save_json(ledger_path,ledger)
  try:
   hp=HttpProfile();hp.reqTimeout=45;hp.endpoint='tts.tencentcloudapi.com'
   cp=ClientProfile();cp.httpProfile=hp
   client=tts_client.TtsClient(cred,'ap-guangzhou',cp)
   req=models.TextToVoiceRequest();req.from_json_string(json.dumps({**spec(voice,text),'SessionId':str(uuid.uuid4())}))
   response=client.TextToVoice(req)
   data=base64.b64decode(response.Audio,validate=True)
   if len(data)<200:raise ValueError('Returned audio is too short.')
   temp=target.with_suffix('.part');temp.write_bytes(data);temp.replace(target)
   record['status']='success';record['request_id']=response.RequestId
  except Exception as ex:
   record['status']='failed';record['error_code']=getattr(ex,'code',type(ex).__name__)
   raise RuntimeError('Tencent TTS failed: '+str(record['error_code'])) from None
  finally:
   with LOCK:save_json(ledger_path,ledger)
 with ThreadPoolExecutor(max_workers=3) as pool:
  for start in range(0,len(jobs),3):
   for result in pool.map(run,jobs[start:start+3]):pass
   print(f'Generated {min(start+3,len(jobs))}/{len(jobs)}',flush=True)
 if args.preview:
  previews=[{'id':v,**PROFILES[v],'src':'/audio/tencent/'+audio_path(v,SAMPLE).name,'text':SAMPLE} for v in args.voices]
  save_json(OUT/'previews.json',previews)
 else:
  packs=[]
  for voice in args.voices:
   manifest={key:'/audio/tencent/'+audio_path(voice,text).name for key,text in texts.items()}
   save_json(OUT/f'manifest-{voice}.json',manifest)
   packs.append({'id':voice,**PROFILES[voice],'id':voice,'voice_id':PROFILES[voice]['id'],'manifest':f'/audio/manifest-{voice}.json'})
  save_json(OUT/'voices.json',{'default':args.voices[0],'disclosure':'腾讯云 AI 合成语音，非原版录音','voices':packs})
  save_json(OUT/'manifest.json',json.loads((OUT/f'manifest-{args.voices[0]}.json').read_text(encoding='utf-8')))
 print(json.dumps({'completed':True,'requests_this_run':len(jobs),'text_characters_this_run':chars}),flush=True)
if __name__=='__main__':
 try:main()
 except Exception as ex:
  print(str(ex),file=sys.stderr);sys.exit(1)
