"""Validate project references and packaged resources without pretending to compile Swift."""
from pathlib import Path
import json
import plistlib
import re
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parent.parent
project_file = root / 'Mazraaty.xcodeproj' / 'project.pbxproj'
token_pattern = re.compile(r'/\*.*?\*/|//[^\n]*|"(?:\\.|[^"\\])*"|[{}()=;,]|[^\s{}()=;,]+', re.S)
tokens = [t for t in token_pattern.findall(project_file.read_text(encoding='utf-8'))
          if not t.startswith('//') and not t.startswith('/*')]
index = 0

def take():
    global index
    if index >= len(tokens):
        raise ValueError('Unexpected end of PBX project')
    token = tokens[index]
    index += 1
    return token

def require(expected):
    actual = take()
    assert actual == expected, f'Expected {expected!r}, got {actual!r}'

def value():
    token = take()
    if token == '{':
        result = {}
        while tokens[index] != '}':
            key = take()
            if key.startswith('"'): key = json.loads(key)
            require('=')
            assert key not in result, f'Duplicate PBX key {key}'
            result[key] = value()
            require(';')
        require('}')
        return result
    if token == '(':
        result = []
        while tokens[index] != ')':
            result.append(value())
            if tokens[index] == ',': take()
            else: assert tokens[index] == ')'
        require(')')
        return result
    return json.loads(token) if token.startswith('"') else token

project = value()
assert index == len(tokens), 'Trailing project tokens'
objects = project['objects']

def references(obj):
    if isinstance(obj, dict):
        for item in obj.values(): yield from references(item)
    elif isinstance(obj, list):
        for item in obj: yield from references(item)
    elif isinstance(obj, str) and re.fullmatch('[A-F0-9]{24}', obj):
        yield obj

assert set(references(project)).issubset(objects), 'Dangling PBX object references'

paths = {}
def walk(identifier, parent):
    item = objects[identifier]
    if item['isa'] == 'PBXGroup':
        directory = parent / item.get('path', '')
        for child in item['children']: walk(child, directory)
    elif item['isa'] == 'PBXFileReference' and item['sourceTree'] == '<group>':
        path = parent / item['path']
        assert path.exists(), f'Missing project file {path}'
        paths[identifier] = path

walk(objects[project['rootObject']]['mainGroup'], root)
source_phases = [obj for obj in objects.values() if obj['isa'] == 'PBXSourcesBuildPhase']
source_paths = {paths[objects[build]['fileRef']] for phase in source_phases for build in phase['files']}
assert source_paths == set((root / 'Mazraaty').glob('*.swift')), 'Swift build phase mismatch'
for path in root.rglob('Contents.json'): json.loads(path.read_text(encoding='utf-8'))
for path in (root / 'Mazraaty/Info.plist', root / 'Mazraaty/PrivacyInfo.xcprivacy'):
    plistlib.loads(path.read_bytes())
scheme = ET.parse(root / 'Mazraaty.xcodeproj/xcshareddata/xcschemes/Mazraaty.xcscheme')
for reference in scheme.findall('.//BuildableReference'):
    assert reference.attrib['BlueprintIdentifier'] in objects
ET.parse(root / 'BrandMark.svg')
from PIL import Image
icon = Image.open(root / 'Mazraaty/Assets.xcassets/AppIcon.appiconset/AppIcon.png')
assert icon.size == (1024, 1024) and icon.mode == 'RGB'
print(f'PASS: PBX grammar, {len(objects)} objects, {len(source_paths)} Swift source references, resources, scheme, opaque icon.')
print('Swift compilation and UI/device tests still require Xcode on macOS.')
