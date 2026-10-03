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
        return this.tasks;
    },

    // 保存任务
    save() {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.tasks));
    },

    // 添加任务
    add(text, date) {
        const task = {
            id: 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
            text: text.trim(),
            date: date || this.todayStr(),
            done: false,
            createdAt: new Date().toISOString()
        };
        this.tasks.unshift(task);
        this.save();
        this.render();
    },

    // 页面每次打开时刷新到期提醒（初始化调用）
    refreshDue() {
        this.renderDueBanner();
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
        this.renderDueBanner();
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
                    <div class="task-meta">
                        <button type="button" class="task-date${this.dateClass(task.date)}" onclick="TaskManager.editDate('${task.id}')" aria-label="点击修改日期">
                            ${task.date ? self.formatDate(task.date) : '设置日期'}
                        </button>
                        <button type="button" class="task-cal-btn" onclick="TaskManager.addToCalendar('${task.id}')" aria-label="加到手机日历提醒" title="加到手机日历">⏰ 提醒</button>
                    </div>
                </div>
                <button class="task-delete" onclick="TaskManager.remove('${task.id}')" aria-label="删除任务">×</button>
            </div>
        `).join('');
    },

    // 点击日期 → 就地切换为日期选择器修改
    editDate(id) {
        var task = this.tasks.find(t => t.id === id);
        if (!task) return;

        // 已有一个编辑器在显示则先清理
        var oldInput = document.querySelector('.task-date-edit');
        if (oldInput) oldInput.remove();

        var btn = document.querySelector('.task-date[onclick*="' + id + '"]');
        if (!btn) return;

        var input = document.createElement('input');
        input.type = 'date';
        input.className = 'task-date-edit';
        input.value = task.date || this.todayStr();

        var committed = false;
        var self = this;
        var commit = function() {
            if (committed) return;
            committed = true;
            var v = input.value;
            if (v && v !== task.date) {
                task.date = v;
                self.save();
                App.showToast('日期已改为 ' + self.formatDate(v));
            }
            self.render();
        };

        btn.parentNode.insertBefore(input, btn);
        btn.style.display = 'none';

        input.addEventListener('change', commit);
        // 失焦提交（用户点别处时保存）
        input.addEventListener('blur', function() {
            setTimeout(commit, 120);
        });

        try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); }
    },

    // 生成 .ics 日历文件并下载/打开 → 由手机系统日历接管提醒
    addToCalendar(id) {
        var task = this.tasks.find(t => t.id === id);
        if (!task) return;
        if (!task.date) { App.showToast('请先设置日期'); return; }

        var dt = task.date.replace(/-/g, '');
        // 默认提醒时间：当天 09:00
        var startT = dt + 'T090000';
        var endT = dt + 'T093000';
        var stamp = this.icsStamp();
        var uid = 'dialysis-task-' + task.id + '@dialysis-diary';

        var ics = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Dialysis Diary//Task//CN',
            'CALSCALE:GREGORIAN',
            'BEGIN:VEVENT',
            'UID:' + uid,
            'DTSTAMP:' + stamp,
            'DTSTART;TZID=Asia/Shanghai:' + startT,
            'DTEND;TZID=Asia/Shanghai:' + endT,
            'SUMMARY:' + this.icsEscape(task.text),
            'DESCRIPTION:' + this.icsEscape('来自透析记录工作台的任务提醒'),
            'BEGIN:VALARM',
            'TRIGGER:-PT0M',
            'ACTION:DISPLAY',
            'DESCRIPTION:' + this.icsEscape(task.text),
            'END:VALARM',
            'END:VEVENT',
            'END:VCALENDAR'
        ].join('\r\n');

        var blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = '任务提醒-' + task.text.slice(0, 10) + '.ics';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function() { URL.revokeObjectURL(url); }, 3000);

        App.showToast('日历文件已生成，打开即可加入手机日历');
    },

    // iCalendar 时间戳
    icsStamp() {
        var d = new Date();
        var p = (n) => (n < 10 ? '0' + n : '' + n);
        return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) +
            'T' + p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds()) + 'Z';
    },

    // iCalendar 文本转义
    icsEscape(s) {
        return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
    },

    // 顶部到期提醒条：今天/已过期的未完成任务
    renderDueBanner() {
        var banner = document.getElementById('taskDueBanner');
        if (!banner) return;
        var today = this.todayStr();
        var due = this.tasks.filter(function(t) { return !t.done && t.date && t.date <= today; });
        if (due.length === 0) {
            banner.classList.add('hidden');
            banner.innerHTML = '';
            return;
        }
        var overdue = due.filter(function(t) { return t.date < today; }).length;
        var parts = [];
        if (due.length - overdue > 0) parts.push('今天到期 ' + (due.length - overdue) + ' 项');
        if (overdue > 0) parts.push('已过期 ' + overdue + ' 项');
        banner.className = 'task-due-banner' + (overdue > 0 ? ' has-overdue' : '');
        banner.innerHTML = '🔔 ' + parts.join(' · ') + ' 未完成';
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
