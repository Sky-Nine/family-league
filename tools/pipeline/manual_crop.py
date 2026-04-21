from PIL import Image
import os
import numpy as np
from rembg import remove
import io

def create_perfect_aligned_sprite(input_path, output_sprite_path, output_gif_path):
    print(f"🖼️ Opening and removing background...")
    with open(input_path, 'rb') as i:
        input_data = i.read()
        output_data = remove(input_data)
    img = Image.open(io.BytesIO(output_data)).convert("RGBA")
    
    w, h = img.size
    qw, qh = w // 2, h // 2
    
    # Sequence: TR, TL, BL, BR
    boxes = [(qw, 0, w, qh), (0, 0, qw, qh), (0, qh, qw, h), (qw, qh, w, h)]
    
    # 1. Extract raw foregrounds and find max dimensions
    char_imgs = []
    max_w, max_h = 0, 0
    
    for box in boxes:
        crop = img.crop(box)
        data = np.array(crop)
        alpha = data[:, :, 3]
        pos = np.where(alpha > 0)
        
        if len(pos[0]) > 0:
            y1, y2, x1, x2 = np.min(pos[0]), np.max(pos[0]), np.min(pos[1]), np.max(pos[1])
            char = crop.crop((x1, y1, x2 + 1, y2 + 1))
            char_imgs.append(char)
            max_w = max(max_w, char.width)
            max_h = max(max_h, char.height)
        else:
            char_imgs.append(None)

    # 2. Setup standard frame size (add some margin)
    padding = 20
    final_f_w = max_w + padding * 2
    final_f_h = max_h + padding * 2
    ground_y = final_f_h - padding
    
    # 3. Align and Compose
    aligned_frames = []
    for char in char_imgs:
        new_f = Image.new("RGBA", (final_f_w, final_f_h), (0, 0, 0, 0))
        if char:
            # Horizontal Center
            target_x = (final_f_w - char.width) // 2
            # Bottom Aligned to ground_y
            target_y = ground_y - char.height
            new_f.paste(char, (target_x, target_y), char)
        aligned_frames.append(new_f)
    
    # 4. Save results
    sheet = Image.new("RGBA", (final_f_w * 4, final_f_h))
    for i, f in enumerate(aligned_frames):
        sheet.paste(f, (i * final_f_w, 0))
    sheet.save(output_sprite_path)
    
    # GIF loop
    aligned_frames[0].save(output_gif_path, save_all=True, append_images=aligned_frames[1:], duration=150, loop=0)
    
    print(f"✨ Perfect Alignment achieved!")
    print(f"📏 Final Frame Size: {final_f_w}x{final_f_h}")
    print(f"✅ Sprite: {output_sprite_path}")

if __name__ == "__main__":
    create_perfect_aligned_sprite(
        "/Users/sky/family-league/assets/sprites/raw_gen.png",
        "/Users/sky/family-league/assets/sprites/final_sprite_perfect.png",
        "/Users/sky/family-league/assets/sprites/dribble_perfect.gif"
    )
