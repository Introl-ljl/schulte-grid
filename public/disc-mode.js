// 圆盘模式 - 旋转舒尔特训练
// 纯粹的注意力与追踪训练，无技能系统

const DiscMode = {
  // 难度配置
  levels: {
    easy: {
      name: '2环16数',
      rings: 2,
      numbersPerRing: [6, 10],  // 内少外多
      speeds: [12, -12],
      total: 16,
      radius: [0.45, 0.78]
    },
    medium: {
      name: '3环25数',
      rings: 3,
      numbersPerRing: [5, 8, 12],  // 内少外多
      speeds: [15, -14, 16],
      total: 25,
      radius: [0.35, 0.58, 0.82]
    },
    hard: {
      name: '4环36数',
      rings: 4,
      numbersPerRing: [4, 8, 10, 14],  // 内少外多
      speeds: [18, -17, 16, -18],
      total: 36,
      radius: [0.28, 0.48, 0.68, 0.86]
    }
  },

  // 游戏状态
  state: {
    difficulty: 'easy',
    rings: [],
    target: 1,
    errors: 0,
    startTime: 0,
    lastTime: 0,
    totalTime: 0,
    clickFeedback: null  // {x, y, type, time}
  },

  // 简单模式开关
  simpleMode: true,

  // 初始化
  init(difficulty = 'easy') {
    const level = this.levels[difficulty];
    this.state = {
      difficulty,
      rings: [],
      target: 1,
      errors: 0,
      startTime: Date.now(),
      lastTime: Date.now(),
      totalTime: 0
    };

    // 生成随机数字布局
    const numbers = this.shuffleArray([...Array(level.total)].map((_, i) => i + 1));
    let index = 0;

    for (let ringIdx = 0; ringIdx < level.rings; ringIdx++) {
      const count = level.numbersPerRing[ringIdx];
      this.state.rings.push({
        index: ringIdx,
        numbers: numbers.slice(index, index + count),
        angle: Math.random() * 360,
        speed: level.speeds[ringIdx],
        radius: level.radius[ringIdx]
      });
      index += count;
    }
  },

  // 洗牌
  shuffleArray(arr) {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  },

  // 更新旋转
  update(deltaTime) {
    this.state.rings.forEach(ring => {
      ring.angle = (ring.angle + ring.speed * deltaTime) % 360;
    });
    this.state.totalTime = Date.now() - this.state.startTime;
  },

  // 点击数字
  click(value, x, y) {
    const isCorrect = value === this.state.target;

    // 设置点击反馈
    this.state.clickFeedback = {
      x, y,
      value,
      type: isCorrect ? 'correct' : 'wrong',
      time: Date.now()
    };

    if (!isCorrect) {
      this.state.errors++;
      return { success: false };
    }

    this.state.target++;
    const level = this.levels[this.state.difficulty];
    const complete = this.state.target > level.total;

    return { success: true, complete };
  },

  // 查找点击位置的数字
  findNumber(x, y, canvas) {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const maxR = Math.min(canvas.width, canvas.height) * 0.45;

    for (const ring of this.state.rings) {
      const ringR = maxR * ring.radius;
      const count = ring.numbers.length;
      const step = 360 / count;

      for (let i = 0; i < count; i++) {
        const angle = (ring.angle + i * step) * Math.PI / 180;
        const nx = cx + ringR * Math.cos(angle);
        const ny = cy + ringR * Math.sin(angle);
        const dist = Math.sqrt((x - nx) ** 2 + (y - ny) ** 2);

        if (dist < 24) return ring.numbers[i];
      }
    }
    return null;
  },

  // 渲染
  render(ctx, canvas) {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const maxR = Math.min(canvas.width, canvas.height) * 0.45;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 绘制环形轨道参考线
    this.state.rings.forEach(ring => {
      ctx.strokeStyle = 'rgba(180, 180, 200, 0.15)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, maxR * ring.radius, 0, Math.PI * 2);
      ctx.stroke();
    });

    // 绘制数字
    this.state.rings.forEach(ring => {
      const ringR = maxR * ring.radius;
      const count = ring.numbers.length;
      const step = 360 / count;

      ring.numbers.forEach((num, i) => {
        const angle = (ring.angle + i * step) * Math.PI / 180;
        const x = cx + ringR * Math.cos(angle);
        const y = cy + ringR * Math.sin(angle);

        const isDone = num < this.state.target;
        const fb = this.state.clickFeedback;
        const flashing = fb && (Date.now() - fb.time) < 300 && num === fb.value;

        let fill, stroke, textColor, font, lw;
        if (this.simpleMode && isDone) {
          // 简单模式：已完成数字变绿
          fill = 'rgba(100, 200, 120, 0.25)';
          stroke = 'rgba(100, 200, 120, 0.5)';
          textColor = '#888';
          font = 'bold 15px Arial';
          lw = 1.5;
        } else if (flashing) {
          // 点击数字本身闪绿（正确）/闪红（错误），与其他舒尔特一致
          const progress = (Date.now() - fb.time) / 300;
          const alpha = 1 - progress;
          const isCorrect = fb.type === 'correct';
          fill = isCorrect ? `rgba(0, 255, 0, ${alpha * 0.45})` : `rgba(255, 0, 0, ${alpha * 0.45})`;
          stroke = isCorrect ? `rgba(0, 255, 0, ${alpha})` : `rgba(255, 0, 0, ${alpha})`;
          textColor = isCorrect ? '#0a8a0a' : '#b00000';
          font = 'bold 17px Arial';
          lw = 3;
        } else {
          fill = 'rgba(100, 150, 255, 0.7)';
          stroke = 'rgba(80, 120, 220, 0.9)';
          textColor = '#fff';
          font = 'bold 17px Arial';
          lw = 2;
        }

        ctx.beginPath();
        ctx.arc(x, y, 24, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();

        ctx.strokeStyle = stroke;
        ctx.lineWidth = lw;
        ctx.stroke();

        ctx.fillStyle = textColor;
        ctx.font = font;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(num, x, y);
      });
    });

    // 清理过期的点击反馈
    if (this.state.clickFeedback && Date.now() - this.state.clickFeedback.time >= 300) {
      this.state.clickFeedback = null;
    }
  }
};

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DiscMode;
}
