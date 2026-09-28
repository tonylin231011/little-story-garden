"""Convert cached Tencent speech locally; no network calls or credentials."""
from pathlib import Path
import subprocess
from concurrent.futures import ThreadPoolExecutor
root=Path(__file__).resolve().parents[1]
files=sorted((root/'public/audio/tencent').glob('*.mp3'))
def convert(file):
 target=file.with_suffix('.wav')
 if not target.exists() or target.stat().st_size<44:
  subprocess.run(['ffmpeg','-nostdin','-hide_banner','-loglevel','error','-y','-i',str(file),'-acodec','pcm_s16le','-ac','1',str(target)],check=True)
 return target.stat().st_size
with ThreadPoolExecutor(max_workers=4) as pool:
 sizes=list(pool.map(convert,files))
print(f'Prepared {len(sizes)} PCM WAV files; {sum(sizes):,} bytes; zero cloud requests.')

