// ========== 任务管理模块 ==========

var TaskManager = {
    STORAGE_KEY: 'dialysis_tasks',
    tasks: [],

    // 初始化
    init() {
        this.load();
        this.render();
        this.bindEvents();
        this.setDefaultDate();
    },

    // 日期默认为今天
    setDefaultDate() {
        var input = document.getElementById('taskDate');
        if (input && !input.value) input.value = this.todayStr();
    },

    // 今天的 YYYY-MM-DD
    todayStr() {
        var d = new Date();
        var m = (d.getMonth() + 1).toString();
        var dd = d.getDate().toString();
        if (m.length < 2) m = '0' + m;
        if (dd.length < 2) dd = '0' + dd;
        return d.getFullYear() + '-' + m + '-' + dd;
    },

    // 加载任务
    load() {
        const data = localStorage.getItem(this.STORAGE_KEY);
        this.tasks = data ? JSON.parse(data) : [];
    },

    // 保存任务
    save() {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.tasks));
    },

    // 添加任务
    add(text, date) {
        const task = {
            id: Date.now().toString(),
            text: text.trim(),
            date: date || this.todayStr(),
            done: false,
            createdAt: new Date().toISOString()
        };
        this.tasks.unshift(task);
        this.save();
        this.render();
    },

    // 切换完成状态
    toggle(id) {
        const task = this.tasks.find(t => t.id === id);
        if (task) {
            task.done = !task.done;
            this.save();
            this.render();
        }
    },

    // 删除任务
    remove(id) {
        this.tasks = this.tasks.filter(t => t.id !== id);
        this.save();
        this.render();
        App.showToast('任务已删除');
    },

    // 渲染任务列表
    render() {
        const list = document.getElementById('taskList');
        if (this.tasks.length === 0) {
            list.innerHTML = '<p class="empty-hint">暂无任务</p>';
            return;
        }

        const self = this;
        list.innerHTML = this.tasks.map(task => `
            <div class="task-item ${task.done ? 'done' : ''}">
                <div class="task-checkbox ${task.done ? 'checked' : ''}" onclick="TaskManager.toggle('${task.id}')"></div>
                <div class="task-main">
                    <span class="task-text">${this.escapeHtml(task.text)}</span>
                    ${task.date ? '<span class="task-date' + this.dateClass(task.date) + '">' + self.formatDate(task.date) + '</span>' : ''}
                </div>
                <button class="task-delete" onclick="TaskManager.remove('${task.id}')" aria-label="删除任务">×</button>
            </div>
        `).join('');
    },

    // 日期格式化为「10月3日（周六）」样式，今年省略年份
    formatDate(dateStr) {
        var parts = String(dateStr).split('-');
        if (parts.length !== 3) return dateStr;
        var y = parseInt(parts[0], 10), m = parseInt(parts[1], 10), d = parseInt(parts[2], 10);
        var week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        var wd = '';
        var dt = new Date(y, m - 1, d);
        if (!isNaN(dt.getTime())) wd = '（' + week[dt.getDay()] + '）';
        var now = new Date();
        var prefix = (y === now.getFullYear()) ? '' : (y + '年');
        return prefix + m + '月' + d + '日' + wd;
    },

    // 日期样式：今天/逾期用不同颜色提示
    dateClass(dateStr) {
        var today = this.todayStr();
        if (dateStr === today) return ' is-today';
        if (dateStr < today) return ' is-past';
        return '';
    },

    // 绑定表单事件
    bindEvents() {
        const form = document.getElementById('taskForm');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const input = document.getElementById('taskInput');
            const dateInput = document.getElementById('taskDate');
            const text = input.value.trim();
            if (text) {
                this.add(text, dateInput ? dateInput.value : '');
                input.value = '';
                if (dateInput) dateInput.value = this.todayStr(); // 重置回今天
                App.showToast('任务已添加');
            }
        });
    },

    // HTML 转义
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};
