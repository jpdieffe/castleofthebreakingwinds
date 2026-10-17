"""Export map data from the unmodified sibling mobile project. Requires a JDK.
The reference is read only. Classes are compiled into this repo's ignored data directory.
"""
from pathlib import Path
import hashlib, json, subprocess
root = Path(__file__).resolve().parents[1]
source = root.parent / 'CastleWinds_Mobile/app/src/main/java/com/castlewinds'
jdk = Path('C:/Program Files/Android/Android Studio/jbr/bin')
classes = root / '.game-data/mobile-map-export'
classes.mkdir(parents=True, exist_ok=True)
files = [source / (name + '.java') for name in ['Game', 'Catalog', 'Bestiary', 'Campaign2']]
subprocess.run([str(jdk / 'javac.exe'), '-encoding', 'UTF-8', '-d', str(classes), *map(str, files), str(root / 'scripts/ExportMobileMaps.java')], check=True)
result = subprocess.check_output([str(jdk / 'java.exe'), '-cp', str(classes), 'com.castlewinds.ExportMobileMaps'])
data = json.loads(result)
data['sourceHashes'] = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
out = root / 'shared/mobile-maps.json'
out.write_text(json.dumps(data, separators=(',', ':'), ensure_ascii=False), encoding='utf-8')
print(f'Exported {len(data["levels"])} native maps, {sum(len(m["tiles"]) for m in data["levels"])} tiles to {out}')
