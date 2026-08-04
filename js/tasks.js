// ========== 任务管理模块 ==========

var TaskManager = {
    STORAGE_KEY: 'dialysis_tasks',
    tasks: [],

    // 初始化
    init() {
        this.load();
        this.render();
        this.bindEvents();
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
    add(text) {
        const task = {
            id: Date.now().toString(),
            text: text.trim(),
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

        list.innerHTML = this.tasks.map(task => `
            <div class="task-item ${task.done ? 'done' : ''}">
                <div class="task-checkbox ${task.done ? 'checked' : ''}" onclick="TaskManager.toggle('${task.id}')"></div>
                <span class="task-text">${this.escapeHtml(task.text)}</span>
                <button class="task-delete" onclick="TaskManager.remove('${task.id}')" aria-label="删除任务">×</button>
            </div>
        `).join('');
    },

    // 绑定表单事件
    bindEvents() {
        const form = document.getElementById('taskForm');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const input = document.getElementById('taskInput');
            const text = input.value.trim();
            if (text) {
                this.add(text);
                input.value = '';
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
