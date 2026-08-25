// ========== 统计图表模块 ==========

var StatsManager = {
    charts: {},
    currentMonth: null,  // 格式 "2026-08"
    chartLoaded: false,  // Chart.js 是否已加载

    // 透析类型颜色映射
    TYPE_COLORS: {
        'HD': '#1976D2',
        'HDF': '#00BFA6',
        'HP': '#FB8C00',
        'HFHD': '#5C6BC0',
        'PD': '#AB47BC'
    },

    // 初始化
    init() {
        // 默认当前月
        var now = new Date();
        var m = (now.getMonth() + 1).toString();
        if (m.length < 2) m = '0' + m;
        this.currentMonth = now.getFullYear() + '-' + m;

        this.bindMonthNav();
        this.renderMonthLabel();
        this.renderOverview();
    },

    // 确保 Chart.js 已加载
    loadChart(callback) {
        if (typeof Chart !== 'undefined') {
            callback();
            return;
        }
        // Chart.js 还没加载完（defer），等一下再试
        var attempts = 0;
        var self = this;
        var timer = setInterval(function() {
            attempts++;
            if (typeof Chart !== 'undefined') {
                clearInterval(timer);
                self.chartLoaded = true;
                callback();
            } else if (attempts > 20) {
                clearInterval(timer);
                App.showToast('图表加载失败，请检查网络');
            }
        }, 100);
    },

    // 月份导航按钮
    bindMonthNav() {
        var self = this;
        var prevBtn = document.getElementById('statsPrevMonth');
        var nextBtn = document.getElementById('statsNextMonth');
        if (prevBtn) {
            prevBtn.addEventListener('click', function() {
                self.shiftMonth(-1);
            });
        }
        if (nextBtn) {
            nextBtn.addEventListener('click', function() {
                self.shiftMonth(1);
            });
        }
    },

    // 切换月份
    shiftMonth(delta) {
        var parts = this.currentMonth.split('-');
        var year = parseInt(parts[0], 10);
        var month = parseInt(parts[1], 10) + delta;
        if (month > 12) { month = 1; year++; }
        if (month < 1) { month = 12; year--; }
        var m = month.toString();
        if (m.length < 2) m = '0' + m;
        this.currentMonth = year + '-' + m;
        this.refresh();
    },

    // 获取当前月份的记录
    getMonthRecords() {
        var all = RecordManager.records;
        var result = [];
        for (var i = 0; i < all.length; i++) {
            if (all[i].date.indexOf(this.currentMonth) === 0) {
                result.push(all[i]);
            }
        }
        return result;
    },

    // 更新数据（当记录变化或切换月份时调用）
    refresh() {
        this.renderMonthLabel();
        this.renderOverview();
        var self = this;
        this.loadChart(function() {
            self.renderCharts();
        });
    },

    // 渲染月份标签
    renderMonthLabel() {
        var parts = this.currentMonth.split('-');
        var year = parseInt(parts[0], 10);
        var month = parseInt(parts[1], 10);
        var label = document.getElementById('statsMonthLabel');
        if (label) label.textContent = year + '年' + month + '月';
    },

    // 渲染概览卡片（当月数据）
    renderOverview() {
        var records = this.getMonthRecords();

        // 本月透析次数
        document.getElementById('monthDialysisCount').textContent = records.length;

        // 平均减水量
        var fluidSum = 0;
        var fluidCount = 0;
        for (var i = 0; i < records.length; i++) {
            if (records[i].fluidRemoved) {
                fluidSum += records[i].fluidRemoved;
                fluidCount++;
            }
        }
        var avgFluid = fluidCount > 0 ? Math.round(fluidSum / fluidCount) : 0;
        document.getElementById('monthAvgFluid').textContent = avgFluid + ' mL';

        // 平均涨水率
        var gainSum = 0;
        var gainCount = 0;
        for (var j = 0; j < records.length; j++) {
            var gr = RecordManager.calcGainRate(records[j].preWeight, records[j].clothesWeight);
            if (gr !== null) {
                gainSum += gr;
                gainCount++;
            }
        }
        var avgGain = gainCount > 0 ? (Math.round(gainSum / gainCount * 10) / 10) : null;
        document.getElementById('monthAvgGainRate').textContent = avgGain !== null ? (avgGain + '%') : '—';
    },

    // 渲染所有图表
    renderCharts() {
        this.renderWeightChart();
        this.renderFluidChart();
        this.renderBPChart();
        this.renderTypeChart();
    },

    // 体重变化趋势图（当月）
    renderWeightChart() {
        var records = this.getMonthRecords().slice().reverse(); // 按时间正序

        var labels = records.map(function(r) {
            var d = new Date(r.date.replace(/-/g, '/'));
            return (d.getMonth() + 1) + '/' + d.getDate();
        });

        var preWeights = records.map(function(r) { return r.preWeight; });
        var postWeights = records.map(function(r) { return r.postWeight || null; });

        var ctx = document.getElementById('weightChart').getContext('2d');

        if (this.charts.weight) {
            this.charts.weight.destroy();
        }

        if (records.length === 0) {
            this.charts.weight = new Chart(ctx, {
                type: 'line',
                data: { labels: ['暂无数据'], datasets: [] },
                options: { responsive: true, maintainAspectRatio: false }
            });
            return;
        }

        this.charts.weight = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: '透前体重 (kg)',
                        data: preWeights,
                        borderColor: '#FB8C00',
                        backgroundColor: 'rgba(251, 140, 0, 0.1)',
                        fill: false,
                        tension: 0.3,
                        pointRadius: 4,
                        pointBackgroundColor: '#FB8C00'
                    },
                    {
                        label: '透后体重 (kg)',
                        data: postWeights,
                        borderColor: '#43A047',
                        backgroundColor: 'rgba(67, 160, 71, 0.1)',
                        fill: false,
                        tension: 0.3,
                        pointRadius: 4,
                        pointBackgroundColor: '#43A047',
                        spanGaps: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { font: { size: 11 }, padding: 12 }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        ticks: { font: { size: 11 } }
                    },
                    x: {
                        ticks: { font: { size: 11 } }
                    }
                }
            }
        });
    },

    // 减水量趋势图（当月）
    renderFluidChart() {
        var records = this.getMonthRecords().slice().reverse();

        var labels = records.map(function(r) {
            var d = new Date(r.date.replace(/-/g, '/'));
            return (d.getMonth() + 1) + '/' + d.getDate();
        });

        var fluids = records.map(function(r) { return r.fluidRemoved || 0; });

        var ctx = document.getElementById('fluidChart').getContext('2d');

        if (this.charts.fluid) {
            this.charts.fluid.destroy();
        }

        if (records.length === 0) {
            this.charts.fluid = new Chart(ctx, {
                type: 'bar',
                data: { labels: ['暂无数据'], datasets: [] },
                options: { responsive: true, maintainAspectRatio: false }
            });
            return;
        }

        this.charts.fluid = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: '减水量 (mL)',
                    data: fluids,
                    backgroundColor: 'rgba(25, 118, 210, 0.6)',
                    borderColor: '#1976D2',
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { font: { size: 11 }, padding: 12 }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            font: { size: 11 },
                            callback: function(value) { return value + ' mL'; }
                        }
                    },
                    x: {
                        ticks: { font: { size: 11 } }
                    }
                }
            }
        });
    },

    // 血压趋势图（当月）
    renderBPChart() {
        var records = this.getMonthRecords().slice().reverse(); // 按时间正序

        var labels = records.map(function(r) {
            var d = new Date(r.date.replace(/-/g, '/'));
            return (d.getMonth() + 1) + '/' + d.getDate();
        });

        var preSys = records.map(function(r) { return (r.preBP && r.preBP.sys) || null; });
        var preDia = records.map(function(r) { return (r.preBP && r.preBP.dia) || null; });
        var postSys = records.map(function(r) { return (r.postBP && r.postBP.sys) || null; });
        var postDia = records.map(function(r) { return (r.postBP && r.postBP.dia) || null; });

        // 检查是否有任何血压数据
        var hasBP = preSys.some(function(v) { return v !== null; }) || postSys.some(function(v) { return v !== null; });

        var ctx = document.getElementById('bpChart').getContext('2d');

        if (this.charts.bp) {
            this.charts.bp.destroy();
        }

        if (!hasBP) {
            this.charts.bp = new Chart(ctx, {
                type: 'line',
                data: { labels: ['暂无血压数据'], datasets: [] },
                options: { responsive: true, maintainAspectRatio: false }
            });
            return;
        }

        this.charts.bp = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: '透前收缩压',
                        data: preSys,
                        borderColor: '#E53935',
                        backgroundColor: 'rgba(229, 57, 53, 0.05)',
                        fill: false,
                        tension: 0.3,
                        pointRadius: 4,
                        pointBackgroundColor: '#E53935',
                        spanGaps: true
                    },
                    {
                        label: '透前舒张压',
                        data: preDia,
                        borderColor: '#FF8A80',
                        backgroundColor: 'transparent',
                        fill: false,
                        tension: 0.3,
                        pointRadius: 3,
                        pointBackgroundColor: '#FF8A80',
                        borderDash: [4, 3],
                        spanGaps: true
                    },
                    {
                        label: '透后收缩压',
                        data: postSys,
                        borderColor: '#1565C0',
                        backgroundColor: 'rgba(21, 101, 192, 0.05)',
                        fill: false,
                        tension: 0.3,
                        pointRadius: 4,
                        pointBackgroundColor: '#1565C0',
                        spanGaps: true
                    },
                    {
                        label: '透后舒张压',
                        data: postDia,
                        borderColor: '#90CAF9',
                        backgroundColor: 'transparent',
                        fill: false,
                        tension: 0.3,
                        pointRadius: 3,
                        pointBackgroundColor: '#90CAF9',
                        borderDash: [4, 3],
                        spanGaps: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { font: { size: 10 }, padding: 8 }
                    },
                    annotation: {}
                },
                scales: {
                    y: {
                        suggestedMin: 50,
                        suggestedMax: 200,
                        ticks: {
                            font: { size: 11 },
                            callback: function(value) { return value + ' mmHg'; }
                        },
                        grid: {
                            color: function(context) {
                                // 140/90 高血压警戒线背景
                                return null;
                            }
                        }
                    },
                    x: {
                        ticks: { font: { size: 11 } }
                    }
                }
            }
        });
    },

    // 透析类型占比图（当月）
    renderTypeChart() {
        var records = this.getMonthRecords();
        var typeCount = {};

        records.forEach(function(r) {
            typeCount[r.type] = (typeCount[r.type] || 0) + 1;
        });

        var labels = Object.keys(typeCount);
        var data = labels.map(function(key) { return typeCount[key]; });
        var self = this;
        var colors = labels.map(function(type) { return self.TYPE_COLORS[type] || '#78909C'; });

        var ctx = document.getElementById('typeChart').getContext('2d');

        if (this.charts.type) {
            this.charts.type.destroy();
        }

        if (records.length === 0) {
            this.charts.type = new Chart(ctx, {
                type: 'doughnut',
                data: { labels: ['暂无数据'], datasets: [{ data: [1], backgroundColor: ['#E0E7EE'] }] },
                options: { responsive: true, maintainAspectRatio: false }
            });
            return;
        }

        this.charts.type = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels.map(function(t) { return RecordManager.TYPE_MAP[t] || t; }),
                datasets: [{
                    data: data,
                    backgroundColor: colors,
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { font: { size: 11 }, padding: 10 }
                    }
                }
            }
        });
    }
};