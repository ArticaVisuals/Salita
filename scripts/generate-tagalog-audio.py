"""Generate personal-use Tagalog lesson audio. Requires Node, FFmpeg, torch and transformers."""
import json
import re
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import torch
from transformers import AutoTokenizer, VitsModel

MODEL = "facebook/mms-tts-tgl"
REVISION = "64ea04f28385d8ef1886fea73e528d5000a9f898"
ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "public/speech"

def spoken_text(text):
    text = re.sub(r"\[[^\]]*\]", " ", text)
    text = re.sub(r"\bng\b", "nang", text, flags=re.IGNORECASE)
    return re.sub(r"\bmga\b", "manga", text, flags=re.IGNORECASE).lower()

def save_clip(clip, sample_rate):
    clip_id, waveform = clip
    destination = OUTPUT / f"{clip_id}.mp3"
    temporary = destination.with_suffix(".tmp")
    subprocess.run(
        [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            "-f", "f32le", "-ar", str(sample_rate), "-ac", "1", "-i", "pipe:0",
            "-c:a", "libmp3lame", "-b:a", "40k", "-f", "mp3", str(temporary),
        ],
        input=waveform.numpy().tobytes(),
        check=True,
    )
    temporary.replace(destination)

def main():
    manifest = json.loads(subprocess.check_output([
        "node", "--input-type=module", "-e",
        "import {getCurriculumSpeechTexts, getSpeechClipId} from './lib/tagalog-speech.ts';"
        "console.log(JSON.stringify(getCurriculumSpeechTexts().map(text => [getSpeechClipId(text), text])));",
    ], cwd=ROOT))
    assert len({clip_id for clip_id, _ in manifest}) == len(manifest)
    OUTPUT.mkdir(exist_ok=True)
    texts = sorted(
        (item for item in manifest if not (OUTPUT / f"{item[0]}.mp3").is_file()),
        key=lambda item: len(item[1]),
    )
    print(f"Generating {len(texts)} of {len(manifest)} clips", flush=True)
    if not texts:
        return

    torch.set_num_threads(6)
    torch.manual_seed(23)
    model = VitsModel.from_pretrained(MODEL, revision=REVISION).eval()
    tokenizer = AutoTokenizer.from_pretrained(MODEL, revision=REVISION)
    with ThreadPoolExecutor(max_workers=4) as encoder, torch.inference_mode():
        for start in range(0, len(texts), 12):
            batch = texts[start:start + 12]
            inputs = tokenizer([spoken_text(text) for _, text in batch], padding=True, return_tensors="pt")
            result = model(**inputs)
            clips = [
                (clip_id, waveform[:length].contiguous())
                for (clip_id, _), waveform, length in zip(batch, result.waveform, result.sequence_lengths)
            ]
            list(encoder.map(lambda clip: save_clip(clip, model.config.sampling_rate), clips))
            if start % 120 == 0 or start + 12 >= len(texts):
                print(f"Generated {min(start + 12, len(texts))}/{len(texts)}", flush=True)

if __name__ == "__main__":
    main()
