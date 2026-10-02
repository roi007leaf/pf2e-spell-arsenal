from pathlib import Path
import sys, json, yaml

root, output = Path(sys.argv[1]), Path(sys.argv[2])
rows = []
for pack in ['spells', 'spells24']:
    for source in (root / pack).rglob('*.yml'):
        data = yaml.safe_load(source.read_text(encoding='utf-8'))
        if data and data.get('type') == 'spell':
            rows.append({'pack': pack, 'source': source.relative_to(root).as_posix(), 'item': data})
output.write_text(json.dumps(rows), encoding='utf-8')
print(json.dumps({pack: sum(row['pack'] == pack for row in rows) for pack in ['spells', 'spells24']}))
