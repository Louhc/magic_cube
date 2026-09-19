# legacy/ —— 已归档的 Python 版本

这里的文件是**历史版本，不再维护**。

现在魔方的几何、投影、配色全部由根目录的 `cube.js` 单点实现，
`index.html` 是交互界面。之所以归档而不是删除，是因为
`f2l.py` 仍然可以独立产出一张 matplotlib 静态图。

| 文件 | 说明 |
|---|---|
| `f2l.py` | 最后一个可用的 Python 版本（针孔透视相机 + 粗描边） |
| `f2l_original_backup.py` | 最初那份有 bug 的原始代码，留作对照 |
| `f2l_preview.png` | `f2l.py` 的输出预览 |

用的是项目自带的虚拟环境：

```bash
../venv/bin/python f2l.py
```

## 和 cube.js 的关系

两者**不共享代码**，几何是各写一份。为了不让它们漂移：

- `cube.js` 里的 `toPython()` 可以把当前配色导出成
  `top_colors / left_colors / right_colors` 三段 Python 代码，
  直接粘进 `f2l.py` 即可。**会变的数据只有这一份来源。**
- 几何参数两边保持一致：`CAM_DIR = (-1,-1,0.6)`、`CAM_DISTANCE = 14.0`、
  `EDGE_WIDTH = 11.0`。

## f2l.py 当初修掉的 4 个 bug（备忘）

1. `draw_face` 里 `p1/p2` 漏了 `row*v` → 第 0 行退化成零面积线段，各行互相重叠。
2. 第三个面画在 `x=3`，那是背面的隐藏面 → 轮廓出现缺口。
   该投影下可见面是 **顶面 z=3、左面 x=0、右面 y=0**。
3. `colors[2-row][col]` 把矩阵转置+镜像了，与注释"从上到下、从左到右"不符。
4. `autoscale_view()` + `margins(0.1)` 得到的 xlim 把左顶点裁掉了。
