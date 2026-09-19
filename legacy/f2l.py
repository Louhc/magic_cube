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

# ==========================================
# 0.1 透视相机参数
# ==========================================
# 魔方占 x,y,z ∈ [0, CUBE_SIZE]
CUBE_SIZE = 3.0

# 从魔方中心指向相机的方向。
#   z = 1.0  → 经典等距视角，俯角 35.26°，顶面很"开"
#   z = 0.6  → 俯角约 23°，顶面压扁一些 —— 参考图就是这个感觉
#   z 越小俯角越低，顶面越扁、侧面越高
CAM_DIR = np.array([-1.0, -1.0, 0.6])

# 相机到魔方中心的距离（单位＝小方块棱长）。
# 这个值决定透视强度：数值越小透视越强（近大远小越明显），
# 数值越大越接近正交投影。参考图的透视其实很轻微，所以距离取得比较远。
#
# 注意：代码固定画 顶面(z=3)、左面(x=0)、右面(y=0) 这三个面，
# 所以相机必须真的在这三个面的外侧，即要满足
#        1.5 + d * z / sqrt(2 + z*z) > 3      (相机高于顶面)
# 否则顶面会转到看不见的方向、画出来就不对了。
# 俯角调得越低(z 越小)，需要的 CAM_DISTANCE 就越大，例如 z=0.3 时约需 d > 7.3。
CAM_DISTANCE = 14.0

# 每个小方块的描边粗细（参考图的黑色边框很粗，所以这里给得比较大）。
# 单位是 point，会随 figsize / dpi 变化而改变相对粗细。
EDGE_WIDTH = 11.0


def draw_rubik_cube(save_path=None, camera_distance=CAM_DISTANCE,
                    camera_dir=CAM_DIR, edge_width=EDGE_WIDTH):
    # ==========================================
    # 1. 配置三个可见面的颜色矩阵 (3x3)
    #    约定：矩阵按“从上到下、从左到右”书写，
    #          代码会把它原样贴到对应的面上。
    # ==========================================
    # 顶面 (U)：第 0 行是后方一排，第 0 列是左侧一列
    top_colors = [
        [COLOR_GRAY,   COLOR_GRAY,   COLOR_GRAY],   # 灰, 灰, 灰
        [COLOR_GRAY,   COLOR_YELLOW, COLOR_GRAY],   # 灰, 黄, 灰
        [COLOR_GRAY,   COLOR_GRAY,   COLOR_RED]     # 灰, 灰, 红
    ]

    # 左面 (L)：x = 0 的那个面
    left_colors = [
        [COLOR_GRAY,   COLOR_GRAY,   COLOR_RED],    # 灰, 灰, 红
        [COLOR_RED,    COLOR_GRAY,   COLOR_RED],    # 红, 灰, 红
        [COLOR_RED,    COLOR_GRAY,   COLOR_GRAY]    # 红, 灰, 灰
    ]

    # 右面 (R)：y = 0 的那个面
    right_colors = [
        [COLOR_GRAY,   COLOR_GREEN,  COLOR_GRAY],   # 灰, 绿, 灰
        [COLOR_GRAY,   COLOR_WHITE,  COLOR_GREEN],  # 灰, 白, 绿
        [COLOR_GRAY,   COLOR_GRAY,   COLOR_GREEN]   # 灰, 灰, 绿
    ]

    # ==========================================
    # 2. 建立透视相机（针孔相机模型）
    #    不再是"平行投影"，而是真正的近大远小：
    #        屏幕坐标 = 焦距 * 相机坐标 / 深度
    #    想调透视强弱改 CAM_DISTANCE，想调俯角改 CAM_DIR 的 z 分量。
    # ==========================================
    center = np.full(3, CUBE_SIZE / 2.0)

    cam_dir = np.asarray(camera_dir, dtype=float)
    cam_dir = cam_dir / np.linalg.norm(cam_dir)      # 相机相对魔方的方位
    eye = center + cam_dir * camera_distance         # 相机位置

    forward = center - eye                           # 相机朝向（指向魔方中心）
    forward = forward / np.linalg.norm(forward)

    world_up = np.array([0.0, 0.0, 1.0])             # 世界上方向 = z 轴
    right = np.cross(forward, world_up)
    right = right / np.linalg.norm(right)
    up = np.cross(right, forward)                    # 相机自身的上方向

    focal = camera_distance                          # 焦距，只影响整体缩放

    def project(x, y, z):
        """将 3D 坐标 (x, y, z) 通过透视投影转换为 2D 屏幕坐标"""
        v = np.array([x, y, z]) - eye
        depth = float(v @ forward)                   # 到相机平面的距离
        screen_x = focal * float(v @ right) / depth
        screen_y = focal * float(v @ up) / depth
        return screen_x, screen_y

    # ==========================================
    # 3. 创建画布
    # ==========================================
    fig, ax = plt.subplots(figsize=(8, 8))
    ax.set_aspect('equal')
    ax.axis('off')

    projected = []   # 收集所有投影点，用来自动计算视野范围

    # ==========================================
    # 4. 绘制一个面的辅助函数
    #    origin : 该面“左上角”小方块的 3D 原点
    #    u_vec  : 每向右移动一格的三维方向
    #    v_vec  : 每向下移动一格的三维方向
    #    这样 colors[row][col] 就能直接对应第 row 行、第 col 列
    # ==========================================
    def draw_face(origin, u_vec, v_vec, colors):
        ox, oy, oz = origin
        ux, uy, uz = u_vec
        vx, vy, vz = v_vec

        for row in range(3):
            for col in range(3):
                # 当前小方块的四个顶点 (3D)
                # 注意：左上/右上要加上 row*v，左下/右下要加上 (row+1)*v，
                #       否则第 0 行会退化成一条线，各行之间还会互相重叠。
                p1 = (ox + col * ux + row * vx,
                      oy + col * uy + row * vy,
                      oz + col * uz + row * vz)
                p2 = (ox + (col + 1) * ux + row * vx,
                      oy + (col + 1) * uy + row * vy,
                      oz + (col + 1) * uz + row * vz)
                p3 = (ox + (col + 1) * ux + (row + 1) * vx,
                      oy + (col + 1) * uy + (row + 1) * vy,
                      oz + (col + 1) * uz + (row + 1) * vz)
                p4 = (ox + col * ux + (row + 1) * vx,
                      oy + col * uy + (row + 1) * vy,
                      oz + col * uz + (row + 1) * vz)

                pts_2d = [project(*p) for p in (p1, p2, p3, p4)]
                projected.extend(pts_2d)

                polygon = patches.Polygon(pts_2d, closed=True,
                                          facecolor=colors[row][col],
                                          edgecolor='#1A1A1A',
                                          linewidth=edge_width,
                                          joinstyle='round')
                ax.add_patch(polygon)

    # ==========================================
    # 5. 绘制魔方的三个可见面
    # ==========================================
    # --- 左面 (x = 0)：origin 是“左上角”的小方块顶点，向右 = -y，向下 = -z ---
    draw_face(
        origin=(0, 3, 3),
        u_vec=(0, -1, 0),
        v_vec=(0, 0, -1),
        colors=left_colors
    )

    # --- 右面 (y = 0)：向右 = +x，向下 = -z ---
    draw_face(
        origin=(0, 0, 3),
        u_vec=(1, 0, 0),
        v_vec=(0, 0, -1),
        colors=right_colors
    )

    # --- 顶面 (z = 3)：第 0 行在后、第 0 列在左 ---
    draw_face(
        origin=(0, 3, 3),
        u_vec=(1, 0, 0),
        v_vec=(0, -1, 0),
        colors=top_colors
    )

    # ==========================================
    # 6. 调整视图
    #    透视之后画面不再是固定尺寸，所以直接按投影结果自动居中取景，
    #    保证魔方完整落在画面内且不会被裁掉。
    # ==========================================
    pts = np.array(projected)
    cx = (pts[:, 0].min() + pts[:, 0].max()) / 2.0
    cy = (pts[:, 1].min() + pts[:, 1].max()) / 2.0
    half = max(np.ptp(pts[:, 0]), np.ptp(pts[:, 1])) / 2.0 * 1.06

    ax.set_xlim(cx - half, cx + half)
    ax.set_ylim(cy - half, cy + half)

    plt.title("Rubik's Cube", fontsize=16, fontweight='bold', pad=16)
    plt.tight_layout()

    if save_path:
        fig.savefig(save_path, dpi=110)

    plt.show()
    return fig, ax


# 运行主函数
if __name__ == "__main__":
    draw_rubik_cube()
