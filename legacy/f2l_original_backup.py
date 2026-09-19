import matplotlib.pyplot as plt
import matplotlib.patches as patches
import numpy as np

# ==========================================
# 0. 定义魔方 7 种标准颜色的常量
# ==========================================
COLOR_RED    = '#C00000'  # 红色 (Red)
COLOR_ORANGE = '#FF8C00'  # 橙色 (Orange)
COLOR_YELLOW = '#FFE600'  # 黄色 (Yellow)
COLOR_WHITE  = '#FFFFFF'  # 白色 (White)
COLOR_GREEN  = '#00B050'  # 绿色 (Green)
COLOR_BLUE   = '#0070C0'  # 蓝色 (Blue)
COLOR_GRAY   = '#C0C0C0'  # 灰色 (Gray / 未定义区域)


def draw_rubik_cube():
    # ==========================================
    # 1. 配置颜色矩阵 (3x3)
    # 现在可以直接使用顶部的颜色常量，非常直观
    # ==========================================
    # 顶面颜色 (从上到下，从左到右)
    top_colors = [
        [COLOR_GRAY,   COLOR_GRAY,   COLOR_GRAY],   # 灰, 灰, 灰
        [COLOR_GRAY,   COLOR_YELLOW, COLOR_GRAY],   # 灰, 黄, 灰
        [COLOR_GRAY,   COLOR_GRAY,   COLOR_RED]     # 灰, 灰, 红
    ]
    
    # 左面颜色 (从上到下，从左到右)
    left_colors = [
        [COLOR_GRAY,   COLOR_GRAY,   COLOR_RED],    # 灰, 灰, 红
        [COLOR_RED,    COLOR_GRAY,   COLOR_RED],    # 红, 灰, 红
        [COLOR_RED,    COLOR_GRAY,   COLOR_GRAY]    # 红, 灰, 灰
    ]
    
    # 右面颜色 (从上到下，从左到右)
    right_colors = [
        [COLOR_GRAY,   COLOR_GREEN,  COLOR_GRAY],   # 灰, 绿, 灰
        [COLOR_GRAY,   COLOR_WHITE,  COLOR_GREEN],  # 灰, 白, 绿
        [COLOR_GRAY,   COLOR_GRAY,   COLOR_GREEN]   # 灰, 灰, 绿
    ]

    # ==========================================
    # 2. 定义等距投影的数学基础
    # ==========================================
    cos30 = np.cos(np.radians(30))
    sin30 = np.sin(np.radians(30))
    
    def project(x, y, z):
        """将 3D 坐标 (x, y, z) 转换为 2D 屏幕坐标"""
        screen_x = (x - y) * cos30
        screen_y = (x + y) * sin30 + z
        return screen_x, screen_y

    # ==========================================
    # 3. 创建画布
    # ==========================================
    fig, ax = plt.subplots(figsize=(8, 8))
    ax.set_aspect('equal')
    ax.axis('off') 

    # ==========================================
    # 4. 绘制各个面的辅助函数
    # ==========================================
    def draw_face(origin_3d, u_vec, v_vec, colors, z_offset=0):
        ox, oy, oz = origin_3d
        ux, uy, uz = u_vec
        vx, vy, vz = v_vec

        for row in range(3):
            for col in range(3):
                # 计算当前小方块的四个顶点 (3D)
                p1 = (ox + col*ux, oy + col*uy, oz + col*uz + z_offset)
                p2 = (ox + (col+1)*ux, oy + (col+1)*uy, oz + (col+1)*uz + z_offset)
                p3 = (ox + (col+1)*ux + row*vx, oy + (col+1)*uy + row*vy, oz + (col+1)*uz + row*vz + z_offset)
                p4 = (ox + col*ux + row*vx, oy + col*uy + row*vy, oz + col*uz + row*vz + z_offset)

                # 投影到 2D
                pts_2d = [project(*p1), project(*p2), project(*p3), project(*p4)]
                
                # 获取颜色
                color = colors[2 - row][col]
                
                # 创建多边形
                polygon = patches.Polygon(pts_2d, closed=True, 
                                          facecolor=color, 
                                          edgecolor='#1A1A1A', 
                                          linewidth=4.5,       
                                          joinstyle='round')   
                ax.add_patch(polygon)

    # ==========================================
    # 5. 绘制魔方的三个面
    # ==========================================
    # --- 顶面 (Top Face) ---
    draw_face(
        origin_3d=(0, 0, 3), 
        u_vec=(1, 0, 0),    
        v_vec=(0, 1, 0),    
        colors=top_colors,
        z_offset=0.01       
    )

    # --- 左面 (Left Face) ---
    draw_face(
        origin_3d=(0, 0, 0), 
        u_vec=(0, 0, 1),    
        v_vec=(1, 0, 0),    
        colors=left_colors,
        z_offset=0.01
    )

    # --- 右面 (Right Face) ---
    draw_face(
        origin_3d=(3, 0, 0), 
        u_vec=(0, 0, 1),    
        v_vec=(0, 1, 0),    
        colors=right_colors,
        z_offset=0.01
    )

    # ==========================================
    # 6. 调整视图并显示
    # ==========================================
    ax.autoscale_view()
    plt.margins(0.1)
    plt.title("Rubik's Cube", fontsize=16, fontweight='bold', pad=20)
    plt.tight_layout()
    plt.show()

# 运行主函数
if __name__ == "__main__":
    draw_rubik_cube()
