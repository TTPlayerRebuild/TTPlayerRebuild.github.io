"""Render the idle TT.experience skin for the website preview.

Source: ../Skin/DEFAULT_SKIN_579.skn; icon: the rebuild's TTPlayer.ico.
Requires Pillow for regeneration only. Pages builds copy the resulting PNG.
Positions and sprite states follow Skin.xml and the supplied idle-player reference.
"""
import io
import zipfile
from pathlib import Path
from PIL import Image

website = Path(__file__).resolve().parent.parent
workspace = website.parent
with zipfile.ZipFile(workspace / 'Skin' / 'DEFAULT_SKIN_579.skn') as skin:
    def bitmap(name):
        image = Image.open(io.BytesIO(skin.read(name + '.bmp'))).convert('RGBA')
        image.putdata([(r, g, b, 0 if (r, g, b) == (255, 0, 255) else 255)
                       for r, g, b, _ in image.getdata()])
        return image

    player = bitmap('player_skin')
    controls = [
        ('stop', 9, 113, 3), ('prev', 66, 113, 3), ('play', 127, 113, 0),
        ('next', 198, 113, 3), ('open', 199, 3, 0), ('minimize', 230, 3, 0),
        ('minimode', 257, 3, 0), ('close', 288, 3, 0),
        ('playlist', 216, 91, 1), ('equalizer', 248, 91, 0), ('lyric', 286, 91, 1),
        ('mute', 294, 76, 0), ('progress_thumb', 16, 94, 0)
    ]
    for name, x, y, state in controls:
        strip = bitmap(name)
        width = strip.width // 4
        frame = strip.crop((state * width, 0, (state + 1) * width, strip.height))
        player.alpha_composite(frame, (x, y))
    numbers = bitmap('number')
    for i, digit in enumerate([0, 0, 10, 0, 0]):
        player.alpha_composite(numbers.crop((digit * 5, 0, digit * 5 + 5, 9)), (183 + i * 5, 95))
    volume = bitmap('progress2')
    player.alpha_composite(volume.crop((0, volume.height - 4, 12, volume.height)), (295, 68))
    icon = Image.open(workspace / 'rebuild' / 'src' / 'app' / 'assets' / 'TTPlayer.ico').ico.getimage((16, 16)).convert('RGBA')
    player.alpha_composite(icon, (7, 5))
    output = website / 'public' / 'assets' / 'default-skin'
    output.mkdir(parents=True, exist_ok=True)
    player.save(output / 'player.png', optimize=True)
    print(f'Saved {player.width} x {player.height} default skin preview.')
