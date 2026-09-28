"""Build a local handoff archive; exclude credentials, caches and tool environments."""
from pathlib import Path
import re,zipfile
root=Path(__file__).resolve().parents[1]
target=root.parent/'Story-Garden-V2.zip'
excluded={'.runtime','tools','node_modules','dist','.git','__pycache__','.pytest_cache'}
files=[]
for path in root.rglob('*'):
 if not path.is_file():continue
 rel=path.relative_to(root)
 if any(part in excluded for part in rel.parts):continue
 if (path.name.startswith('.env') and path.name!='.env.example') or path.suffix in {'.log','.pem','.secret','.pyc','.part','.zip'}:continue
 if path.name in {'test-tone.wav','patch_voice_ui.py'}:continue
 if path.suffix in {'.js','.mjs','.json','.md','.txt','.py','.ps1','.cmd','.html','.css'} or path.name=='.env.example':
  text=path.read_text(encoding='utf-8',errors='replace')
  if re.search(r'AKID[A-Za-z0-9]{20,}',text):raise SystemExit('Credential-like value detected; archive not created.')
 files.append(path)
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as out:
 for path in files:out.write(path,'story-garden/'+path.relative_to(root).as_posix())
with zipfile.ZipFile(target) as archive:
 assert archive.testzip() is None
 names=archive.namelist()
 assert sum(n.endswith('.wav') and '/audio/tencent/' in n for n in names)==203
 assert sum('/public/images/' in n and n.endswith('.png') for n in names)==6
 for required in ['server/reader-supervisor.mjs','scripts/Install-ReaderService.ps1','scripts/Manage-ReaderService.ps1','scripts/Run-ReaderService.ps1','scripts/Reader-Service-Common.ps1','server/ai.mjs','src/library.js','.env.example','public/vendor/pdfjs/pdf.mjs','public/vendor/pdfjs/pdf.worker.mjs','public/vendor/pdfjs/LICENSE']:
  assert 'story-garden/'+required in names,required
 assert not any(Path(n).name.startswith('.env') and Path(n).name!='.env.example' for n in names)
 print(f'Archive: {target.name}; {len(names)} files; {target.stat().st_size:,} bytes; integrity OK; no private environment files or Tencent key IDs.')
