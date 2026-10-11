/**
 * 数据备份与恢复（Backup）
 * - 导出：把全部 localStorage 数据打包成 JSON 文件下载
 * - 恢复：读取备份文件，覆盖写回本地数据并刷新页面
 *
 * 覆盖的键：透析记录、干体重、指标、首次透析日期、任务、血压、食物分类顺序
 */
var Backup = {
    // 需要备份的数据键
    DATA_KEYS: [
        'dialysis_records',
        'dialysis_dry_weight',
        'dialysis_metrics',
        'dialysis_first_date',
        'dialysis_tasks',
        'dialysis_bp',
        'food_cat_order'
    ],

    init() {
        // 用事件委托 + 直接绑定双保险，避免时机问题
        var self = this;

        document.addEventListener('click', function(e) {
            var t = e.target;
            // 兼容点到按钮内部文字节点的情况
            if (t && t.closest) {
                if (t.closest('#backupBtn')) { e.preventDefault(); self.exportAll(); return; }
                if (t.closest('#restoreBtn')) { e.preventDefault(); self.openFilePicker(); return; }
            }
        });

        var file = document.getElementById('restoreFile');
        if (file) {
            file.addEventListener('change', function(ev) { self.importFile(ev); });
        }
    },

    // 触发文件选择
    openFilePicker() {
        var file = document.getElementById('restoreFile');
        if (file) {
            file.value = '';
            file.click();
        } else {
            this.setStatus('❌ 未找到文件选择器', true);
        }
    },

    // ===== 导出 =====
    exportAll() {
        var data = {};
        var summary = { records: 0, bp: 0, tasks: 0, metrics: 0 };

        this.DATA_KEYS.forEach(k => {
            var v = localStorage.getItem(k);
            if (v !== null) {
                try { data[k] = JSON.parse(v); } catch (e) { data[k] = v; }
            }
        });

        // 统计条数（便于用户确认导出内容）
        try {
            var recs = JSON.parse(localStorage.getItem('dialysis_records') || '[]');
            summary.records = Array.isArray(recs) ? recs.length : 0;
        } catch (e) {}
        try {
            var bps = JSON.parse(localStorage.getItem('dialysis_bp') || '[]');
            summary.bp = Array.isArray(bps) ? bps.length : 0;
        } catch (e) {}
        try {
            var tks = JSON.parse(localStorage.getItem('dialysis_tasks') || '[]');
            summary.tasks = Array.isArray(tks) ? tks.length : 0;
        } catch (e) {}

        var payload = {
            app: '透析日记',
            version: 1,
            exportedAt: new Date().toISOString(),
            summary: summary,
            data: data
        };

        var json = JSON.stringify(payload, null, 2);
        var blob = new Blob([json], { type: 'application/json' });
        var url = URL.createObjectURL(blob);

        var d = new Date();
        var stamp = d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0') + '_' +
            String(d.getHours()).padStart(2, '0') +
            String(d.getMinutes()).padStart(2, '0');
        var filename = '透析日记备份_' + stamp + '.json';

        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 3000);

        this.setStatus('✅ 已导出：记录 ' + summary.records + ' 条、血压 ' + summary.bp + ' 条、任务 ' + summary.tasks + ' 条', false);
    },

    // ===== 恢复 =====
    importFile(e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        var self = this;
        var reader = new FileReader();
        reader.onload = function(ev) {
            try {
                var payload = JSON.parse(ev.target.result);
                if (!payload || !payload.data) {
                    self.setStatus('❌ 文件格式不正确，请选择本工作台导出的备份文件', true);
                    return;
                }
                var data = payload.data;
                var csv = payload.summary ? ('记录 ' + (payload.summary.records || 0) + ' 条、血压 ' + (payload.summary.bp || 0) + ' 条') : '';
                var ok = confirm('即将用备份文件覆盖当前数据\n' + (csv ? '（备份含：' + csv + '）\n' : '') + '\n⚠️ 当前数据将被覆盖，确定继续吗？');
                if (!ok) { self.setStatus('已取消恢复', false); return; }

                self.DATA_KEYS.forEach(function(k) {
                    if (Object.prototype.hasOwnProperty.call(data, k)) {
                        var v = data[k];
                        localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
                    }
                });

                self.setStatus('✅ 恢复成功，正在刷新…', false);
                setTimeout(function() { location.reload(); }, 900);
            } catch (err) {
                self.setStatus('❌ 读取失败：文件可能已损坏', true);
            }
        };
        reader.readAsText(file);
        // 允许重复选择同一文件
        e.target.value = '';
    },

    setStatus(msg, isErr) {
        var el = document.getElementById('backupStatus');
        if (!el) return;
        el.textContent = msg;
        el.className = 'backup-status' + (isErr ? ' backup-status-err' : ' backup-status-ok');
    }
};
