"""Extract only regular runtime files; no links, devices or parent paths."""
import pathlib
import sys
import tarfile

archive, destination = sys.argv[1:]
root = pathlib.Path(destination).resolve()
allowed = {'package.json', 'package-lock.json', 'release.json', 'server', 'shared', 'dist', 'resource', 'deploy'}
count = total = 0
with tarfile.open(archive, 'r|gz') as source:
    for member in source:
        count += 1
        total += member.size
        if count > 20000 or total > 2 * 1024**3:
            raise ValueError('Release exceeds extraction limits')
        path = pathlib.PurePosixPath(member.name)
        if (not path.parts or path.is_absolute() or '..' in path.parts
                or path.parts[0] not in allowed or '\\' in member.name
                or not (member.isfile() or member.isdir())
                or any(p in {'.env', 'node_modules', '.git'} for p in path.parts)):
            raise ValueError('Unsafe archive member: ' + member.name)
# Stream extraction after bounded preflight; do not cache an unbounded header list.
with tarfile.open(archive, 'r|gz') as source:
    for member in source:
        target = root.joinpath(*pathlib.PurePosixPath(member.name).parts)
        if member.isdir():
            target.mkdir(parents=True, exist_ok=True)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            with source.extractfile(member) as src, target.open('xb') as dst:
                while block := src.read(1024 * 1024):
                    dst.write(block)
            target.chmod(0o644)
