# DDColor Tiny research

Date: 2026-11-08  
Question: Can DDColor Tiny be compared with DeOldify Stable in the local desktop app?  
Sources: DDColor authors' repository, exporter, model zoo, model card, and paper

## Findings

The DDColor authors publish the Tiny checkpoint as `piddnad/ddcolor_paper_tiny`. The model zoo calls it their lightest variant and says it uses the same training scheme as the paper model. The ICCV paper lists 55 million parameters for DDColor-Tiny. This makes it a reasonable candidate for comparison, but the parameter count alone does not prove it will run faster in this app. ([DDColor model zoo](https://github.com/piddnad/DDColor/blob/master/MODEL_ZOO.md), [model card](https://huggingface.co/piddnad/ddcolor_paper_tiny), [ICCV paper](https://openaccess.thecvf.com/content/ICCV2023/papers/Kang_DDColor_Towards_Photo-Realistic_Image_Colorization_via_Dual_Decoders_ICCV_2023_paper.pdf))

The authors provide an ONNX exporter and a DDColor Tiny ONNX Runtime demo. The exporter defaults to a fixed 512 × 512 input and opset 12. It names the input `input` and output `output`. It builds the Tiny model with two output channels. The demo shows that these are Lab `a` and `b` color channels, not an RGB image. The application must preserve the source photo's Lab lightness, feed a grayscale RGB image, resize the predicted `a` and `b` channels, then combine them with the original lightness. ([official ONNX exporter](https://github.com/piddnad/DDColor/blob/master/scripts/export_onnx.py), [official ONNX demo](https://github.com/piddnad/DDColor/blob/master/demo/colorization_pipeline_onnxruntime.ipynb), [model architecture](https://github.com/piddnad/DDColor/blob/master/basicsr/archs/ddcolor_arch.py))

The model card and repository declare Apache-2.0. Keep the license and model attribution with any downloaded checkpoint or converted ONNX file. Confirm the checkpoint revision and hash before caching it. ([DDColor license](https://github.com/piddnad/DDColor/blob/master/LICENSE), [Tiny model card](https://huggingface.co/piddnad/ddcolor_paper_tiny))

## Comparison implications

Use the same source photos for both models. Save one output per model and photo, preserve each original, and compare results side by side. Include portraits, a group or family scene, and an outdoor or street scene. Assess whether the result adds visible color, keeps faces and clothing plausible, avoids large color artifacts, and preserves the original light and detail. Photo color is not objectively recoverable from a grayscale scan, so the app keeps both choices available.

The app uses a third-party ONNX conversion, not the authors' official exporter. The authors' Python demo does not establish WebAssembly compatibility. The converted model has now rendered in the app on a public-use portrait, and its appearance matched the reference-pipeline comparison.

## Four-photo comparison

The app uses the third-party `models-v1` ONNX conversion for DDColor Tiny. Its pinned asset is 222,200,930 bytes with SHA-256 `bc441aba000b9de6a36e0b71ea35924aed344d92e6865b22fa1e62efbe72d0ce`. The converter exports a `gray` tensor to `ab` Lab channels, which differs from the authors' official exporter names `input` and `output`. The model license is Apache-2.0; the conversion project license is MIT. ([pinned conversion release](https://github.com/Makistos/colorize/releases/tag/models-v1), [DDColor license](https://github.com/piddnad/DDColor/blob/master/LICENSE))

I downloaded four Library of Congress JPEGs with public-use or no-known-restrictions records: a 1899–1900 studio portrait, a 1936 farm scene, a 1939 family at home, and the 1936 Migrant Mother portrait. ([studio portrait](https://www.loc.gov/pictures/item/99472158/), [farm family](https://www.loc.gov/pictures/collection/fsa/item/2017768065/), [family at home](https://www.loc.gov/pictures/collection/fsa/item/2017738689/), [Migrant Mother series](https://guides.loc.gov/migrant-mother/images))

I ran both ONNX files through the pinned converter project's Python CPU pipeline with its model-specific preprocessing and the same Lab reconstruction. This is a reference-pipeline comparison, not a quality benchmark.

| Photo | DeOldify Stable: mean chroma, p90, seconds | DDColor Tiny: mean chroma, p90, seconds | Visual result |
|---|---:|---:|---|
| 1899–1900 studio portrait | 1.98, 3.31, 5.16 | 11.89, 21.76, 0.99 | Stable stayed close to gray. Tiny colored the face and background, with a strong cyan patch. |
| 1936 farm scene | 7.14, 16.48, 4.02 | 13.24, 34.86, 0.70 | Stable was muted. Tiny was much more vivid and added stronger color blocks. |
| 1939 family at home | 8.40, 20.06, 3.89 | 13.67, 31.49, 0.71 | Tiny colored more areas, including vivid red and blue clothing. |
| 1936 Migrant Mother portrait | 12.58, 24.38, 3.89 | 10.82, 30.56, 0.69 | Both added color. Tiny had higher local chroma, with little gain in mean chroma. |

The local comparison sheet is `.cache/model-comparison/overview.png`. These grayscale sources have no ground-truth colors. This small set cannot establish which output is historically accurate. Stable can look gray on a formal old portrait. Tiny produces more visible color but may add obvious color artifacts. CPU times above do not predict Wasm performance.

I opened the 1899–1900 portrait in the desktop app and ran Tiny, then switched models and reran the same open photo with Stable. Both WebAssembly results rendered. Tiny showed stronger color and a clear cyan patch. Stable remained muted but showed more restrained skin and background color without that large patch. The dropdown and same-photo rerun worked.

DeOldify Stable remains the default because the user chose fewer color errors and less vivid color for family photos. DDColor Tiny stays available as a one-click alternative when Stable looks too gray. Both models can recolorize the same open photo.

## Open questions

- The Tiny ONNX release asset is 222,200,930 bytes. Its pinned SHA-256 is `bc441aba000b9de6a36e0b71ea35924aed344d92e6865b22fa1e62efbe72d0ce`.
- ONNX Runtime WebAssembly operator support, memory use, and speed on the target Mac and Windows laptop remain unverified.
- The desktop app was visually checked with both models on the same public-use portrait. The other three photos were compared through the pinned Python reference pipeline, not through the Electron app.
- Stable inference on this Mac took longer than the UI check's 30-second observation window before it completed. CPU timing on Windows remains unknown.

