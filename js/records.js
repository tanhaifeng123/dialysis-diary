// ========== 透析记录管理模块 ==========

var RecordManager = {
    STORAGE_KEY: 'dialysis_records',
    DRY_WEIGHT_KEY: 'dialysis_dry_weight',
    records: [],
    dryWeight: null,  // 干体重
    editingId: null,  // 当前编辑的记录 ID

    // 透析类型映射
    TYPE_MAP: {
        'HD': 'HD（血液透析）',
        'HDF': 'HDF（透析滤过）',
        'HP': 'HP（血液灌流）',
        'HFHD': 'HFHD（高通量）',
        'PD': 'PD（腹膜透析）'
    },

    // 常见透析症状列表
    SYMPTOM_LIST: ['抽筋', '皮肤瘙痒', '头晕', '恶心呕吐', '胸闷', '头痛', '乏力', '气短', '低血压', '高血压'],

    // 初始化
    init() {
        this.load();
        this.loadDryWeight();
        this.setDefaultDate();
        this.initSymptomTags();
        this.render();
        this.bindEvents();
    },

    // 初始化症状标签点击事件
    initSymptomTags() {
        var tags = document.querySelectorAll('.symptom-tag');
        tags.forEach(function(tag) {
            tag.addEventListener('click', function() {
                this.classList.toggle('selected');
            });
        });
    },

    // 获取选中的症状列表
    getSelectedSymptoms() {
        var selected = [];
        document.querySelectorAll('.symptom-tag.selected').forEach(function(tag) {
            selected.push(tag.getAttribute('data-symptom'));
        });
        return selected;
    },

    // 设置选中症状（编辑模式）
    setSelectedSymptoms(symptoms) {
        var tags = document.querySelectorAll('.symptom-tag');
        tags.forEach(function(tag) {
            var s = tag.getAttribute('data-symptom');
            if (symptoms && symptoms.indexOf(s) !== -1) {
                tag.classList.add('selected');
            } else {
                tag.classList.remove('selected');
            }
        });
    },

    // 清除症状选择
    clearSymptoms() {
        document.querySelectorAll('.symptom-tag.selected').forEach(function(tag) {
            tag.classList.remove('selected');
        });
    },

    // 加载干体重
    loadDryWeight() {
        var val = localStorage.getItem(this.DRY_WEIGHT_KEY);
        this.dryWeight = val ? parseFloat(val) : null;
        this.renderDryWeight();
    },

    // 保存干体重
    saveDryWeight() {
        var input = document.getElementById('dryWeight');
        var val = parseFloat(input.value);
        if (!val || val < 20 || val > 200) {
            App.showToast('请输入有效体重（20-200kg）');
            return;
        }
        this.dryWeight = val;
        localStorage.setItem(this.DRY_WEIGHT_KEY, val.toString());
        this.renderDryWeight();
        this.render();  // 重新渲染记录列表（历史记录涨水率不变，只更新表单提示）
        this.updateGainRateHint();  // 更新表单中的涨水率提示
        App.showToast('干体重已保存，后续新记录将使用新干体重');
    },

    // 渲染干体重区域
    renderDryWeight() {
        var inputRow = document.querySelector('.dry-weight-row');
        var display = document.getElementById('dryWeightDisplay');
        if (this.dryWeight) {
            inputRow.classList.add('hidden');
            display.classList.remove('hidden');
            document.getElementById('dryWeightValue').textContent = this.dryWeight + ' kg';
        } else {
            inputRow.classList.remove('hidden');
            display.classList.add('hidden');
        }
    },

    // 编辑干体重
    editDryWeight() {
        var inputRow = document.querySelector('.dry-weight-row');
        var display = document.getElementById('dryWeightDisplay');
        inputRow.classList.remove('hidden');
        display.classList.add('hidden');
        var input = document.getElementById('dryWeight');
        input.value = this.dryWeight || '';
        input.focus();
    },

    // 计算涨水率：实际透前体重 = 透前体重 - 衣服重量
    // 涨水率 = (实际透前体重 - 干体重) / 干体重 * 100%
    calcGainRate(preWeight, clothesWeight) {
        if (!this.dryWeight || !preWeight || preWeight <= 0) return null;
        var cw = clothesWeight || 0;
        var actualWeight = preWeight - cw;
        if (actualWeight <= 0) return null;
        var rate = (actualWeight - this.dryWeight) / this.dryWeight * 100;
        return Math.round(rate * 10) / 10;  // 保留1位小数
    },

    // 涨水率等级
    gainRateLevel(rate) {
        if (rate === null) return null;
        if (rate < 3) return 'normal';
        if (rate < 5) return 'warning';
        return 'danger';
    },

    // 涨水率等级文字
    gainRateText(rate) {
        if (rate === null) return '';
        if (rate < 3) return '正常';
        if (rate < 5) return '偏高';
        return '过高';
    },

    // 更新表单中的涨水率实时提示
    updateGainRateHint() {
        var hint = document.getElementById('gainRateHint');
        var preWeight = parseFloat(document.getElementById('preWeight').value);
        var clothesWeight = parseFloat(document.getElementById('clothesWeight').value) || 0;
        var rate = this.calcGainRate(preWeight, clothesWeight);
        if (rate === null) {
            hint.textContent = '';
            hint.className = 'gain-rate-hint';
            return;
        }
        var level = this.gainRateLevel(rate);
        var text = this.gainRateText(rate);
        var actualWeight = preWeight - clothesWeight;
        var detail = clothesWeight > 0
            ? '（实际体重' + actualWeight.toFixed(1) + 'kg = ' + preWeight + ' - 衣服' + clothesWeight + '）'
            : '';
        hint.textContent = '涨水率 ' + rate + '%（' + text + '）' + detail;
        hint.className = 'gain-rate-hint ' + level;
    },

    // 加载记录（含旧数据兼容）
    load() {
        var data = localStorage.getItem(this.STORAGE_KEY);
        this.records = data ? JSON.parse(data) : [];
        var migrated = false;
        
        // 先加载干体重，用于补算旧记录的涨水率
        var dw = localStorage.getItem(this.DRY_WEIGHT_KEY);
        this.dryWeight = dw ? parseFloat(dw) : null;
        
        for (var i = 0; i < this.records.length; i++) {
            var r = this.records[i];
            // 兼容旧数据：减水量 <=10 视为升，×1000 转毫升
            if (r.fluidRemoved && r.fluidRemoved <= 10) {
                r.fluidRemoved = Math.round(r.fluidRemoved * 1000);
                migrated = true;
            }
            // 兼容旧数据：没有 gainRate 字段的记录，用当前干体重补算一次并存储
            if (r.gainRate === undefined && this.dryWeight) {
                r.gainRate = this.calcGainRate(r.preWeight, r.clothesWeight);
                r.dryWeightAtSave = this.dryWeight;
                migrated = true;
            }
        }
        if (migrated) this.save();
    },

    // 保存记录
    save() {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.records));
    },

    // 添加记录
    add(record) {
        this.records.push(record);
        this.records.sort(function(a, b) {
            return new Date(b.date.replace(/-/g, '/')) - new Date(a.date.replace(/-/g, '/'));
        });
        this.save();
        this.render();
    },

    // 更新记录
    update(id, record) {
        var idx = this.records.findIndex(function(r) { return r.id === id; });
        if (idx !== -1) {
            this.records[idx] = record;
            this.records.sort(function(a, b) {
                return new Date(b.date.replace(/-/g, '/')) - new Date(a.date.replace(/-/g, '/'));
            });
            this.save();
            this.render();
        }
    },

    // 删除记录
    remove(id) {
        this.records = this.records.filter(function(r) { return r.id !== id; });
        this.save();
        this.render();
        App.showToast('记录已删除');
    },

    // 进入编辑模式：把记录数据填入表单
    edit(id) {
        var record = this.records.find(function(r) { return r.id === id; });
        if (!record) return;

        this.editingId = id;
        document.getElementById('recordDate').value = record.date;
        document.getElementById('dialysisType').value = record.type;
        document.getElementById('preWeight').value = record.preWeight;
        document.getElementById('clothesWeight').value = record.clothesWeight || '';
        document.getElementById('postWeight').value = record.postWeight || '';
        document.getElementById('fluidRemoved').value = record.fluidRemoved || '';

        // 症状回填
        this.setSelectedSymptoms(record.symptoms || []);

        document.getElementById('notes').value = record.notes || '';

        // 更新涨水率提示（编辑时按当前表单值实时计算）
        this.updateGainRateHint();

        // 切换到记录页
        var navBtns = document.querySelectorAll('.nav-btn');
        navBtns.forEach(function(b) { b.classList.remove('active'); });
        document.querySelector('.nav-btn[data-tab="records"]').classList.add('active');
        var tabPages = document.querySelectorAll('.tab-page');
        tabPages.forEach(function(p) { p.classList.remove('active'); });
        document.getElementById('tab-records').classList.add('active');

        // 改按钮文字
        var submitBtn = document.querySelector('#recordForm button[type="submit"]');
        submitBtn.textContent = '更新记录';
        document.getElementById('cancelEditBtn').classList.remove('hidden');

        // 滚动到表单顶部
        document.querySelector('.app-header').scrollIntoView({ behavior: 'smooth' });

        App.showToast('正在编辑，修改后点击更新');
    },

    // 取消编辑
    cancelEdit() {
        this.editingId = null;
        var form = document.getElementById('recordForm');
        form.reset();
        this.setDefaultDate();
        this.clearSymptoms();
        var submitBtn = document.querySelector('#recordForm button[type="submit"]');
        submitBtn.textContent = '保存记录';
        document.getElementById('cancelEditBtn').classList.add('hidden');
    },

    // 设置默认日期为今天
    setDefaultDate() {
        var d = new Date();
        var year = d.getFullYear();
        var month = (d.getMonth() + 1).toString();
        var day = d.getDate().toString();
        if (month.length < 2) month = '0' + month;
        if (day.length < 2) day = '0' + day;
        document.getElementById('recordDate').value = year + '-' + month + '-' + day;
    },

    // 渲染记录列表（按月折叠）
    render() {
        var list = document.getElementById('recordList');
        var count = document.getElementById('recordCount');
        count.textContent = this.records.length + ' 条';

        if (this.records.length === 0) {
            list.innerHTML = '<p class="empty-hint">暂无记录，开始添加第一条吧</p>';
            return;
        }

        var self = this;

        // 按月分组
        var groups = {};
        for (var i = 0; i < this.records.length; i++) {
            var r = this.records[i];
            var ym = r.date.substring(0, 7); // "2026-08"
            if (!groups[ym]) groups[ym] = [];
            groups[ym].push(r);
        }

        // 按月份倒序排列
        var sortedMonths = Object.keys(groups).sort(function(a, b) {
            return b.localeCompare(a);
        });

        var html = '';
        for (var mi = 0; mi < sortedMonths.length; mi++) {
            var monthKey = sortedMonths[mi];
            var monthRecords = groups[monthKey];
            var year = parseInt(monthKey.substring(0, 4), 10);
            var month = parseInt(monthKey.substring(5, 7), 10);
            var monthLabel = year + '年' + month + '月';

            // 计算该月统计（使用记录保存时的涨水率，不随干体重变化）
            var monthGainSum = 0;
            var monthGainCount = 0;
            var monthFluidSum = 0;
            var monthFluidCount = 0;
            for (var ri = 0; ri < monthRecords.length; ri++) {
                var gr = monthRecords[ri].gainRate;
                if (gr !== null && gr !== undefined) { monthGainSum += gr; monthGainCount++; }
                if (monthRecords[ri].fluidRemoved) { monthFluidSum += monthRecords[ri].fluidRemoved; monthFluidCount++; }
            }
            var avgGain = monthGainCount > 0 ? (Math.round(monthGainSum / monthGainCount * 10) / 10) : null;
            var avgFluid = monthFluidCount > 0 ? Math.round(monthFluidSum / monthFluidCount) : null;

            var summaryParts = [monthRecords.length + ' 条记录'];
            if (avgGain !== null) summaryParts.push('均涨水率 ' + avgGain + '%');
            if (avgFluid !== null) summaryParts.push('均减水 ' + avgFluid + ' mL');

            // 第一个月份默认展开
            var expanded = (mi === 0);

            html += '<div class="month-group' + (expanded ? ' expanded' : '') + '" data-month="' + monthKey + '">';
            html += '<div class="month-group-header" onclick="RecordManager.toggleMonth(this)">';
            html += '<span class="month-toggle-icon">' + (expanded ? '▼' : '▶') + '</span>';
            html += '<span class="month-group-title">' + monthLabel + '</span>';
            html += '<span class="month-group-summary">' + summaryParts.join(' · ') + '</span>';
            html += '</div>';
            html += '<div class="month-group-body"' + (expanded ? '' : ' style="display:none"') + '>';

            for (var rj = 0; rj < monthRecords.length; rj++) {
                html += self.renderRecordItem(monthRecords[rj]);
            }

            html += '</div></div>';
        }

        list.innerHTML = html;
    },

    // 展开/折叠月份
    toggleMonth(headerEl) {
        var group = headerEl.parentNode;
        var body = headerEl.nextElementSibling;
        var icon = headerEl.querySelector('.month-toggle-icon');
        if (group.classList.contains('expanded')) {
            group.classList.remove('expanded');
            body.style.display = 'none';
            icon.textContent = '▶';
        } else {
            group.classList.add('expanded');
            body.style.display = 'block';
            icon.textContent = '▼';
        }
    },

    // 渲染单条记录 HTML
    renderRecordItem(r) {
        var self = this;
        var fluidDisplay = r.fluidRemoved
            ? (r.fluidRemoved >= 1000 ? (r.fluidRemoved / 1000).toFixed(2) + ' L' : r.fluidRemoved + ' mL')
            : '<span class="data-pending">待填</span>';
        var postDisplay = r.postWeight ? (r.postWeight + ' kg') : '<span class="data-pending">待填</span>';

        // 净脱：需要透前和透后都有
        var netDisplay = (r.postWeight && r.preWeight)
            ? (r.preWeight - r.postWeight).toFixed(1) + ' kg'
            : '—';

        // 使用记录保存时存储的涨水率；如果没有则实时补算并存储
        var gainRate = (r.gainRate !== undefined && r.gainRate !== null) ? r.gainRate : null;
        if (gainRate === null && self.dryWeight) {
            gainRate = self.calcGainRate(r.preWeight, r.clothesWeight);
            r.gainRate = gainRate;
            r.dryWeightAtSave = self.dryWeight;
            self.save();
        }
        var gainRateHtml = '';
        if (gainRate !== null) {
            var level = self.gainRateLevel(gainRate);
            var text = self.gainRateText(gainRate);
            var cwText = (r.clothesWeight && r.clothesWeight > 0)
                ? ' · 已扣衣服' + r.clothesWeight + 'kg'
                : '';
            gainRateHtml = '<span class="gain-rate-tag ' + level + '">涨水率 ' + gainRate + '%（' + text + '）' + cwText + '</span>';
        }

        // 症状显示
        var symptomHtml = '';
        if (r.symptoms && r.symptoms.length > 0) {
            symptomHtml = '<div class="record-symptom-row">';
            for (var si = 0; si < r.symptoms.length; si++) {
                symptomHtml += '<span class="symptom-badge">' + self.escapeHtml(r.symptoms[si]) + '</span>';
            }
            symptomHtml += '</div>';
        }

        // 待补填标记
        var pendingBadge = (!r.postWeight) ? '<span class="pending-badge">待补填</span>' : '';

        return '<div class="record-item">' +
            '<div class="record-item-actions">' +
                '<button class="btn-edit" onclick="RecordManager.edit(\'' + r.id + '\')" aria-label="编辑记录">编辑</button>' +
                '<button class="btn-danger record-item-delete" onclick="RecordManager.remove(\'' + r.id + '\')" aria-label="删除记录">删除</button>' +
            '</div>' +
            '<div class="record-item-header">' +
                '<span class="record-item-date">' + self.formatDate(r.date) + ' <span class="date-type-badge ' + r.type + '">' + r.type + '</span></span>' +
                pendingBadge +
            '</div>' +
            gainRateHtml +
            '<div class="record-item-data">' +
                '<div class="record-data-item">' +
                    '<span class="record-data-label">透前体重</span>' +
                    '<span class="record-data-value weight-pre">' + r.preWeight + ' kg</span>' +
                '</div>' +
                '<div class="record-data-item">' +
                    '<span class="record-data-label">透后体重</span>' +
                    '<span class="record-data-value weight-post">' + postDisplay + '</span>' +
                '</div>' +
                '<div class="record-data-item">' +
                    '<span class="record-data-label">减水量</span>' +
                    '<span class="record-data-value fluid">' + fluidDisplay + '</span>' +
                '</div>' +
                '<div class="record-data-item">' +
                    '<span class="record-data-label">净脱</span>' +
                    '<span class="record-data-value">' + netDisplay + '</span>' +
                '</div>' +
            '</div>' +
            symptomHtml +
            (r.notes ? '<div class="record-item-notes">📝 ' + self.escapeHtml(r.notes) + '</div>' : '') +
        '</div>';
    },

    // 绑定表单事件
    bindEvents() {
        var self = this;
        var form = document.getElementById('recordForm');
        form.addEventListener('submit', function(e) {
            e.preventDefault();

            var preWeight = parseFloat(document.getElementById('preWeight').value);
            var postWeightVal = document.getElementById('postWeight').value.trim();
            var postWeight = postWeightVal ? parseFloat(postWeightVal) : null;
            var fluidVal = document.getElementById('fluidRemoved').value.trim();
            var fluidRemoved = fluidVal ? parseFloat(fluidVal) : null;

            // 校验：透后体重不应大于透前体重
            if (postWeight && postWeight > preWeight) {
                App.showToast('透后体重不应大于透前体重');
                return;
            }

            // 收集症状
            var symptoms = self.getSelectedSymptoms();

            if (self.editingId) {
                // 编辑模式：更新记录
                var record = {
                    id: self.editingId,
                    date: document.getElementById('recordDate').value,
                    type: document.getElementById('dialysisType').value,
                    preWeight: preWeight,
                    clothesWeight: parseFloat(document.getElementById('clothesWeight').value) || 0,
                    postWeight: postWeight,
                    fluidRemoved: fluidRemoved,
                    symptoms: symptoms,
                    notes: document.getElementById('notes').value.trim(),
                    gainRate: self.calcGainRate(preWeight, parseFloat(document.getElementById('clothesWeight').value) || 0),
                    dryWeightAtSave: self.dryWeight
                };
                self.update(self.editingId, record);
                self.cancelEdit();
                App.showToast('记录已更新');
            } else {
                // 新增模式
                var record = {
                    id: Date.now().toString(),
                    date: document.getElementById('recordDate').value,
                    type: document.getElementById('dialysisType').value,
                    preWeight: preWeight,
                    clothesWeight: parseFloat(document.getElementById('clothesWeight').value) || 0,
                    postWeight: postWeight,
                    fluidRemoved: fluidRemoved,
                    symptoms: symptoms,
                    notes: document.getElementById('notes').value.trim(),
                    gainRate: self.calcGainRate(preWeight, parseFloat(document.getElementById('clothesWeight').value) || 0),
                    dryWeightAtSave: self.dryWeight
                };
                self.add(record);
                form.reset();
                self.setDefaultDate();
                self.clearSymptoms();
                App.showToast(postWeight ? '记录已保存' : '透前数据已保存，下机后记得补填');
            }
        });

        // 取消编辑按钮
        var cancelBtn = document.getElementById('cancelEditBtn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', function() {
                self.cancelEdit();
            });
        }

        // 干体重保存按钮
        document.getElementById('saveDryWeightBtn').addEventListener('click', function() {
            self.saveDryWeight();
        });

        // 干体重回车保存
        document.getElementById('dryWeight').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                self.saveDryWeight();
            }
        });

        // 干体重修改按钮
        document.getElementById('editDryWeightBtn').addEventListener('click', function() {
            self.editDryWeight();
        });

        // 透前体重输入时实时计算涨水率
        document.getElementById('preWeight').addEventListener('input', function() {
            self.updateGainRateHint();
        });

        // 衣服重量输入时实时重算涨水率
        document.getElementById('clothesWeight').addEventListener('input', function() {
            self.updateGainRateHint();
        });

        // 输入框聚焦时自动滚动到可见位置（移动端键盘弹起时不遮挡）
        var formInputs = document.querySelectorAll('#recordForm input, #recordForm select, #recordForm textarea');
        formInputs.forEach(function(el) {
            el.addEventListener('focus', function() {
                setTimeout(function() {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 300);
            });
        });

        // 导出给医生
        var exportBtn = document.getElementById('exportBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', function() {
                self.exportData();
            });
        }
    },

    // 导出记录数据给医生
    exportData() {
        if (this.records.length === 0) {
            App.showToast('暂无记录可导出');
            return;
        }

        var self = this;
        var lines = [];
        lines.push('========== 透析记录摘要 ==========');
        lines.push('生成时间：' + new Date().toLocaleString('zh-CN'));
        if (self.dryWeight) {
            lines.push('干体重：' + self.dryWeight + ' kg');
        }
        lines.push('记录总数：' + self.records.length + ' 条');
        lines.push('');

        // 导出最近30条（或全部如果少于30条）
        var exportCount = Math.min(self.records.length, 30);
        lines.push('--- 最近 ' + exportCount + ' 条记录 ---');
        for (var i = 0; i < exportCount; i++) {
            var r = self.records[i];
            lines.push('');
            lines.push('【' + self.formatDate(r.date) + '】 ' + (self.TYPE_MAP[r.type] || r.type));

            // 体重
            var parts = [];
            parts.push('透前' + r.preWeight + 'kg');
            if (r.postWeight) parts.push('透后' + r.postWeight + 'kg');
            if (r.fluidRemoved) parts.push('减水' + r.fluidRemoved + 'mL');
            if (r.clothesWeight && r.clothesWeight > 0) parts.push('衣服' + r.clothesWeight + 'kg');
            lines.push('  体重：' + parts.join('，'));

            // 涨水率
            if (r.gainRate !== null && r.gainRate !== undefined) {
                lines.push('  涨水率：' + r.gainRate + '%（' + self.gainRateText(r.gainRate) + '）');
            }

            // 症状
            if (r.symptoms && r.symptoms.length > 0) {
                lines.push('  症状：' + r.symptoms.join('、'));
            }

            // 备注
            if (r.notes) {
                lines.push('  备注：' + r.notes);
            }
        }

        lines.push('');
        lines.push('================================');

        var text = lines.join('\n');

        // 优先使用 Web Share API（手机端可直接分享到微信等）
        if (navigator.share) {
            navigator.share({
                title: '透析记录摘要',
                text: text
            }).catch(function() {});
        } else if (navigator.clipboard && navigator.clipboard.writeText) {
            // 备选：复制到剪贴板
            navigator.clipboard.writeText(text).then(function() {
                App.showToast('已复制到剪贴板，可粘贴到微信发给医生');
            }, function() {
                // 最终备选：在新窗口打开
                self.showExportModal(text);
            });
        } else {
            self.showExportModal(text);
        }
    },

    // 导出结果弹窗（不支持分享/剪贴板时的备选）
    showExportModal(text) {
        var modal = document.createElement('div');
        modal.className = 'export-modal';
        modal.innerHTML = '<div class="export-modal-content">' +
            '<h3>透析记录摘要</h3>' +
            '<p style="font-size:12px;color:var(--text-light);margin-bottom:8px">长按下方文字可复制</p>' +
            '<pre class="export-text">' + this.escapeHtml(text) + '</pre>' +
            '<button type="button" class="btn-primary" onclick="this.closest(\'.export-modal\').remove()">关闭</button>' +
            '</div>';
        document.body.appendChild(modal);
    },

    // 格式化日期
    formatDate(dateStr) {
        var d = new Date(dateStr.replace(/-/g, '/'));
        var month = d.getMonth() + 1;
        var day = d.getDate();
        var weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        var monthStr = month < 10 ? '0' + month : month;
        var dayStr = day < 10 ? '0' + day : day;
        return d.getFullYear() + '/' + monthStr + '/' + dayStr + ' ' + weekdays[d.getDay()];
    },

    // HTML 转义
    escapeHtml(text) {
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};
