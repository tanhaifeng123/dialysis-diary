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

    // 日期/时间默认为今天 09:00
    setDefaultDate() {
        var input = document.getElementById('taskDate');
        if (input && !input.value) input.value = this.todayStr();
        var timeInput = document.getElementById('taskTime');
        if (timeInput && !timeInput.value) timeInput.value = this.defaultTime();
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
    add(text, date, time) {
        const task = {
            id: 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
            text: text.trim(),
            date: date || this.todayStr(),
            time: time || '',
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
                        <button type="button" class="task-date${this.dateClass(task.date)}" onclick="TaskManager.editDate('${task.id}')" aria-label="点击修改日期和时间">
                            ${task.date ? self.formatDate(task.date) : '设置日期'}${task.time ? '<span class="task-time-chip">' + task.time + '</span>' : ''}
                        </button>
                        <button type="button" class="task-cal-btn" onclick="TaskManager.addToCalendar('${task.id}')" aria-label="加到手机日历提醒" title="加到手机日历">⏰ ${task.time ? self.fmtTimeShort(task.time) : '提醒'}</button>
                    </div>
                </div>
                <button class="task-delete" onclick="TaskManager.remove('${task.id}')" aria-label="删除任务">×</button>
            </div>
        `).join('');
    },

    // 时间缩写显示（09:00 -> 9点）
    fmtTimeShort(t) {
        if (!t) return '';
        var parts = String(t).split(':');
        var h = parseInt(parts[0], 10);
        var m = parseInt(parts[1], 10);
        if (isNaN(h)) return t;
        if (!m) return h + '点';
        return h + ':' + (m < 10 ? '0' + m : m);
    },

    // 点击日期 → 就地展开日期 + 时间选择器 + 确定/取消（不会自动收起）
    editDate(id) {
        var task = this.tasks.find(t => t.id === id);
        if (!task) return;

        // 已有一个编辑器在显示则先清理
        var oldEditor = document.querySelector('.task-date-editor');
        if (oldEditor) oldEditor.remove();

        var btn = document.querySelector('.task-date[onclick*="' + id + '"]');
        if (!btn) return;

        var box = document.createElement('span');
        box.className = 'task-date-editor';

        var input = document.createElement('input');
        input.type = 'date';
        input.className = 'task-date-edit';
        input.value = task.date || this.todayStr();

        var timeInput = document.createElement('input');
        timeInput.type = 'time';
        timeInput.className = 'task-time-edit';
        timeInput.step = '300';
        timeInput.value = task.time || '09:00';

        var ok = document.createElement('button');
        ok.type = 'button';
        ok.className = 'task-date-ok';
        ok.textContent = '确定';

        var cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'task-date-cancel';
        cancel.textContent = '取消';

        var self = this;
        var close = function(save) {
            if (save) {
                var v = input.value;
                var t = timeInput.value;
                var changed = false;
                if (v && v !== task.date) { task.date = v; changed = true; }
                if (t !== (task.time || '')) { task.time = t; changed = true; }
                if (changed) {
                    self.save();
                    App.showToast('已更新为 ' + (v ? self.formatDate(v) : '') + (t ? ' ' + t : ''));
                }
            }
            self.render();
        };

        ok.addEventListener('click', function(e) { e.stopPropagation(); close(true); });
        cancel.addEventListener('click', function(e) { e.stopPropagation(); close(false); });

        box.appendChild(input);
        box.appendChild(timeInput);
        box.appendChild(ok);
        box.appendChild(cancel);
        btn.parentNode.insertBefore(box, btn);
        btn.style.display = 'none';

        // 唤起系统日期选择器（失败也没关系，input 一直留在页面上可点）
        if (input.showPicker) {
            try { input.showPicker(); } catch (e) {}
        }
        setTimeout(function() { try { input.focus({ preventScroll: true }); } catch (e) {} }, 60);
    },

    // 生成 .ics 日历文件并下载/打开 → 由手机系统日历接管提醒
    addToCalendar(id) {
        var task = this.tasks.find(t => t.id === id);
        if (!task) return;
        if (!task.date) { App.showToast('请先设置日期'); return; }

        var dt = task.date.replace(/-/g, '');
        // 提醒时间：使用任务设定的时刻，未设置则默认 09:00
        var tm = (task.time || '09:00').replace(':', '');
        var startT = dt + 'T' + tm + '00';
        var endT = dt + 'T' + tm + '30';
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
            const timeInput = document.getElementById('taskTime');
            const text = input.value.trim();
            if (text) {
                this.add(text, dateInput ? dateInput.value : '', timeInput ? timeInput.value : '');
                input.value = '';
                if (dateInput) dateInput.value = this.todayStr(); // 重置回今天
                if (timeInput) timeInput.value = this.defaultTime(); // 重置回默认时间
                App.showToast('任务已添加');
            }
        });
    },

    // 默认提醒时间：当前时间之后的整点，简化处理取 09:00
    defaultTime() {
        return '09:00';
    },

    // HTML 转义
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};
