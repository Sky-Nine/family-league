import os
import sys
import argparse
import requests
import json
import time
from PIL import Image, ImageDraw, ImageOps
import numpy as np
import cv2
from rembg import remove

# --- Constants & Configuration ---
DEFAULT_PROMPT = "pixel art sprite sheet, dribbling basketball animation sequence, 6 frames, solid green background, 8-bit retro game asset, flat lighting, full body"
LEONARDO_API_BASE = "https://cloud.leonardo.ai/api/rest/v1"

def get_api_key():
    key = os.getenv("LEONARDO_API_KEY")
    if not key:
        print("❌ Error: LEONARDO_API_KEY environment variable not set.")
        sys.exit(1)
    return key

# --- Step 1: Leonardo API Interface ---

def upload_image(file_path):
    print(f"☁️ [Upload] Preparing to upload reference image: {file_path}")
    api_key = get_api_key()
    headers = {"accept": "application/json", "content-type": "application/json", "authorization": f"Bearer {api_key}"}
    
    # 1. Init Upload
    ext = os.path.splitext(file_path)[1].lower().replace('.', '')
    res = requests.post(f"{LEONARDO_API_BASE}/init-upload", json={"extension": ext}, headers=headers)
    if res.status_code != 200:
        print(f"❌ Init Upload Failed: {res.text}")
        return None
    
    upload_data = res.json()["uploadInitImage"]
    image_id = upload_data["id"]
    presigned_url = upload_data["url"]
    fields = json.loads(upload_data["fields"])
    
    # 2. Actual Upload to S3
    print(f"📤 Uploading file to storage...")
    with open(file_path, 'rb') as f:
        files = {'file': f}
        upload_res = requests.post(presigned_url, data=fields, files=files)
        if upload_res.status_code not in [200, 204]:
            print(f"❌ S3 Upload Failed: {upload_res.status_code}")
            return None
            
    print(f"✅ Upload successful. Image ID: {image_id}")
    return image_id

def generate_leonardo_image(prompt, model_id, ref_image_path=None):
    api_key = get_api_key()
    headers = {
        "accept": "application/json",
        "content-type": "application/json",
        "authorization": f"Bearer {api_key}"
    }

    # Prepare Payload
    payload = {
        "height": 512,
        "width": 1024,
        "modelId": model_id, # Flexible model selection
        "prompt": prompt,
        "num_images": 1,
        "public": False
    }

    # Handle Image Guidance (Character Reference)
    if ref_image_path and os.path.exists(ref_image_path):
        ref_id = upload_image(ref_image_path)
        if ref_id:
            payload["controlnets"] = [
                {
                    "initImageId": ref_id,
                    "initImageType": "UPLOADED",
                    "preprocessorId": 133, # Character Reference
                    "strengthType": "Mid"
                }
            ]

    print(f"🚀 [Step 1] Requesting generation from Leonardo.ai...")
    response = requests.post(f"{LEONARDO_API_BASE}/generations", json=payload, headers=headers)
    if response.status_code != 200:
        print(f"❌ API Request Failed: {response.text}")
        sys.exit(1)
    
    gen_id = response.json()["sdGenerationJob"]["generationId"]
    print(f"🕒 Generation ID: {gen_id}. Waiting for completion...")

    # Polling for result
    while True:
        res = requests.get(f"{LEONARDO_API_BASE}/generations/{gen_id}", headers=headers)
        data = res.json()["generations_by_pk"]
        if data["status"] == "COMPLETE":
            img_url = data["generated_images"][0]["url"]
            print(f"✅ Generation Complete! URL: {img_url}")
            return img_url
        elif data["status"] == "FAILED":
            print("❌ Generation Failed on Leonardo side.")
            sys.exit(1)
        time.sleep(5)

def download_image(url, save_path):
    print(f"📥 Downloading image to {save_path}...")
    res = requests.get(url)
    with open(save_path, "wb") as f:
        f.write(res.content)

# --- Step 2 & 3: BG Removal & Denoising ---

def process_background_and_noise(img_path, min_px_size=50):
    print(f"✂️ [Step 2] Removing background and noise...")
    with open(img_path, 'rb') as i:
        input_data = i.read()
        output_data = remove(input_data)
    
    # Load as PIL then CV2
    img_rgba = Image.open(requests.utils.io.BytesIO(output_data)).convert("RGBA")
    cv_img = cv2.cvtColor(np.array(img_rgba), cv2.COLOR_RGBA2BGRA)
    
    # Split alpha channel for noise filtering
    b, g, r, a = cv2.split(cv_img)
    
    # Denoising: Remove small islands
    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(a, connectivity=8)
    new_alpha = np.zeros_like(a)
    for i in range(1, num_labels): # skip background 0
        if stats[i, cv2.CC_STAT_AREA] >= min_px_size:
            new_alpha[labels == i] = 255
            
    # Reconstruct with clean alpha
    cv_img_clean = cv2.merge([b, g, r, new_alpha])
    return Image.fromarray(cv2.cvtColor(cv_img_clean, cv2.COLOR_BGRA2RGBA))

# --- Step 4 & 5: Slicing, Centering (Bottom Aligned) & Outlining ---

def slice_and_process_frames(img_rgba, frame_count, frame_size=128, padding_bottom=8, stroke_width=1, grid_mode=None):
    print(f"🎯 [Step 3] Slicing frames and aligning (Bottom Pivot)...")
    cv_img = cv2.cvtColor(np.array(img_rgba), cv2.COLOR_RGBA2BGRA)
    _, _, _, a = cv2.split(cv_img)
    
    # Find components
    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(a, connectivity=8)
    
    # IMPROVEMENT: If we found too many components, try bridging gaps with Morphological Closing
    if num_labels > frame_count * 2:
        print(f"🌉 Found many fragments ({num_labels-1}). Attempting to bridge gaps with Morphological Closing...")
        kernel = np.ones((9,9), np.uint8) # Increased kernel size
        a = cv2.morphologyEx(a, cv2.MORPH_CLOSE, kernel)
        num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(a, connectivity=8)
        
    print(f"🔍 Found {num_labels - 1} raw components.")
    
    # Collect components
    components = []
    for i in range(1, num_labels):
        x, y, w, h, area = stats[i]
        if area < 50: continue
        components.append({'x': x, 'y': y, 'w': w, 'h': h, 'area': area, 'label': i})
    
    # Debug: Print top 10 areas
    sorted_by_area = sorted(components, key=lambda c: c['area'], reverse=True)
    print("📊 Top 10 component areas:", [c['area'] for c in sorted_by_area[:10]])
    
    # Take top N by area
    components = sorted_by_area[:frame_count]
    
    # Default sort by X for horizontal sheets (if not grid-mode)
    if grid_mode is None:
        components.sort(key=lambda c: c['x'])
    
    # Custom Order Logic (Step 4.1)
    if grid_mode == "2x2" and len(components) == 4:
        print("🔲 Grid Mode: 2x2. Applying custom quadrant sorting.")
        # Find bounds to determine quadrants
        all_x = [c['x'] + c['w']/2 for c in components]
        all_y = [c['y'] + c['h']/2 for c in components]
        mid_x = sum(all_x) / 4
        mid_y = sum(all_y) / 4
        
        quads = {}
        for c in components:
            cx, cy = c['x'] + c['w']/2, c['y'] + c['h']/2
            if cx < mid_x and cy < mid_y: quads['tl'] = c
            elif cx >= mid_x and cy < mid_y: quads['tr'] = c
            elif cx < mid_x and cy >= mid_y: quads['bl'] = c
            else: quads['br'] = c
            
        # User Order: TR -> TL -> BL -> BR
        order_keys = ['tr', 'tl', 'bl', 'br']
        components = [quads[k] for k in order_keys if k in quads]
    
    processed_frames = []
    
    for i, comp in enumerate(components):
        # Extract sprite
        mask = (labels == comp['label']).astype(np.uint8) * 255
        sprite_raw = cv2.bitwise_and(cv_img, cv_img, mask=mask)
        # Crop to bounding box
        sprite_crop = sprite_raw[comp['y']:comp['y']+comp['h'], comp['x']:comp['x']+comp['w']]
        sprite_pil = Image.fromarray(cv2.cvtColor(sprite_crop, cv2.COLOR_BGRA2RGBA))
        
        # Add Stroke (Step 5)
        if stroke_width > 0:
            sprite_pil = add_stroke(sprite_pil, stroke_width)
        
        # Create standard frame and Align (Step 4)
        new_frame = Image.new("RGBA", (frame_size, frame_size), (0, 0, 0, 0))
        
        # Horizontal Center
        pos_x = (frame_size - sprite_pil.width) // 2
        # Vertical: Bottom Aligned
        pos_y = frame_size - sprite_pil.height - padding_bottom
        
        new_frame.paste(sprite_pil, (pos_x, pos_y), sprite_pil)
        processed_frames.append(new_frame)
        
    return processed_frames

def add_stroke(img, width=1):
    # Quick alpha dilation for stroke
    cv_img = cv2.cvtColor(np.array(img), cv2.COLOR_RGBA2BGRA)
    b, g, r, a = cv2.split(cv_img)
    kernel = np.ones((width*2+1, width*2+1), np.uint8)
    dilated_a = cv2.dilate(a, kernel, iterations=1)
    
    # Create white stroke background
    stroke_bg = np.zeros_like(cv_img)
    stroke_bg[dilated_a > 0] = [255, 255, 255, 255] # White
    
    # Paste original on top
    # We do this using PIL for transparency blend or just masks
    res_pil = Image.new("RGBA", img.size, (0,0,0,0))
    stroke_pil = Image.fromarray(cv2.cvtColor(stroke_bg, cv2.COLOR_BGRA2RGBA))
    res_pil.paste(stroke_pil, (0,0))
    res_pil.paste(img, (0,0), img)
    return res_pil

# --- Step 6: Color Quantization ---

def quantize_frames(frames, colors=32):
    if colors <= 0: return frames
    print(f"🎨 [Step 4] Quantizing colors to {colors}...")
    q_frames = []
    for f in frames:
        # PIL quantization doesn't preserve alpha well if not careful
        # Convert to P mode with a palette
        alpha = f.getchannel('A')
        f_rgb = f.convert('RGB')
        f_q = f_rgb.quantize(colors=colors).convert('RGBA')
        # Re-apply alpha
        f_q.putalpha(alpha)
        q_frames.append(f_q)
    return q_frames

# --- Step 7: Stitching ---

def stitch_frames(frames, frame_size):
    print(f"🧵 [Step 5] Stitching {len(frames)} frames into final sprite sheet...")
    sheet_width = len(frames) * frame_size
    sheet = Image.new("RGBA", (sheet_width, frame_size), (0,0,0,0))
    
    for i, f in enumerate(frames):
        sheet.paste(f, (i * frame_size, 0))
    return sheet

# --- Main CLI ---

def main():
    parser = argparse.ArgumentParser(description="AI Pixel Art Sprite Sheet Automation Pipeline")
    parser.add_argument("--ref", type=str, help="Path to reference image (optional)")
    parser.add_argument("--output", type=str, default="final_sprite.png", help="Output filename")
    parser.add_argument("--frame_count", type=int, default=6, help="Expected number of frames")
    parser.add_argument("--frame_size", type=int, default=128, help="Size of each square frame")
    parser.add_argument("--padding_bottom", type=int, default=8, help="Padding from bottom for alignment")
    parser.add_argument("--stroke", type=int, default=1, help="Stroke width in pixels")
    parser.add_argument("--quantize", type=int, default=32, help="Number of colors for quantization")
    parser.add_argument("--model", type=str, default="de7d3faf-762f-48e0-b3b7-9d0ac3a3fcf3", help="Leonardo Model ID (default: Phoenix)")
    parser.add_argument("--grid", type=str, default=None, choices=[None, "2x2"], help="Grid layout mode (e.g., 2x2)")
    parser.add_argument("--skip_gen", action="store_true", help="Skip AI generation and use 'raw_gen.png' if exists")
    parser.add_argument("--prompt", type=str, default=DEFAULT_PROMPT, help="Custom prompt for generation")
    
    args = parser.parse_args()

    raw_path = "raw_gen.png"

    # Step 1: Generation
    if not args.skip_gen:
        img_url = generate_leonardo_image(args.prompt, args.model, args.ref)
        download_image(img_url, raw_path)
    else:
        # Check if user provided a specific path for raw_gen
        if args.ref and not os.path.exists(raw_path) and os.path.exists(args.ref):
            raw_path = args.ref
            
        if not os.path.exists(raw_path):
            print(f"❌ Error: {raw_path} not found. Cannot skip generation.")
            sys.exit(1)
        print(f"⏭️ Skipping generation, using local {raw_path}")

    # Step 2 & 3: BG & Noise
    clean_img = process_background_and_noise(raw_path)
    clean_img.save("processed_debug.png") # Debug save

    # Step 4 & 5: Slice & Stroke
    frames = slice_and_process_frames(
        clean_img, 
        args.frame_count, 
        args.frame_size, 
        args.padding_bottom, 
        args.stroke,
        grid_mode=args.grid
    )

    # Step 6: Quantize
    final_frames = quantize_frames(frames, args.quantize)

    # Step 7: Stitch
    final_sheet = stitch_frames(final_frames, args.frame_size)
    final_sheet.save(args.output)
    
    print(f"\n✨ All done! Final sprite sheet saved as: {args.output}")
    print(f"📏 Dimensions: {final_sheet.width}x{final_sheet.height}")

if __name__ == "__main__":
    main()
