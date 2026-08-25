// ========== 主应用逻辑 ==========

// 合并扩充食物数据（按食物名称去重：同名条目以原数据为准，不覆盖）
function mergeFoodData(base, extra) {
    if (!extra) return;
    ['low', 'mid', 'high'].forEach(function(level) {
        var extraLevel = extra[level];
        if (!extraLevel || !base[level]) return;
        // 收集该档位下所有已有食物名称（跨类别去重，避免同一食物出现在两个类别）
        var allNames = {};
        Object.keys(base[level].categories).forEach(function(cat) {
            base[level].categories[cat].forEach(function(f) { allNames[f.name] = true; });
        });
        Object.keys(extraLevel.categories).forEach(function(cat) {
            if (!base[level].categories[cat]) base[level].categories[cat] = [];
            extraLevel.categories[cat].forEach(function(f) {
                if (!allNames[f.name]) {
                    base[level].categories[cat].push(f);
                    allNames[f.name] = true;
                }
            });
        });
    });
}

var App = {
    // Toast 定时器
    toastTimer: null,

    // 初始化
    init() {
        // 合并扩充食物数据（钾/磷/优质蛋白）
        if (typeof FOOD_EXTRA !== 'undefined') {
            mergeFoodData(FOOD_DATA, FOOD_EXTRA.k);
            mergeFoodData(PHOS_DATA, FOOD_EXTRA.p);
            mergeFoodData(PROTEIN_DATA, FOOD_EXTRA.pr);
        }

        this.initTabNav();
        this.initMineralSwitch();
        this.initFoodTabs();
        this.initPWA();

        // 初始化各模块
        RecordManager.init();
        TaskManager.init();
        StatsManager.init();
        MetricsManager.init();

        // 初始渲染食物
        this.renderFoods('low');

        // 折叠头吸顶偏移：跟随顶部标题栏实际高度（不同设备字体缩放下也精确贴合）
        var setStickyOffset = function() {
            var headerEl = document.querySelector('.app-header');
            if (headerEl) {
                document.documentElement.style.setProperty('--sticky-offset', headerEl.offsetHeight + 'px');
            }
        };
        setStickyOffset();
        window.addEventListener('resize', setStickyOffset);

        // 注册 Service Worker
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('service-worker.js')
                    .catch(err => console.log('SW 注册失败:', err));
            });
        }
    },

    // Tab 导航
    initTabNav() {
        const navBtns = document.querySelectorAll('.nav-btn');
        const tabPages = document.querySelectorAll('.tab-page');

        navBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tabName = btn.dataset.tab;

                // 更新导航按钮状态
                navBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // 更新页面显示
                tabPages.forEach(page => page.classList.remove('active'));
                document.getElementById(`tab-${tabName}`).classList.add('active');

                // 如果切换到统计页，刷新图表
                if (tabName === 'stats') {
                    setTimeout(() => StatsManager.refresh(), 100);
                }
            });
        });
    },

    // 矿物质切换（钾/磷）
    initMineralSwitch() {
        var self = this;
        this.foodMineral = 'k';
        var btns = document.querySelectorAll('.mineral-switch-btn');
        btns.forEach(function(btn) {
            btn.addEventListener('click', function() {
                if (self.foodMineral === btn.dataset.mineral) return;
                btns.forEach(function(b) { b.classList.remove('active'); });
                btn.classList.add('active');
                self.foodMineral = btn.dataset.mineral;
                self.updateFoodMineralUI();

                // 清空搜索，重置到低含量分类
                document.getElementById('foodSearch').value = '';
                document.getElementById('foodSearchResult').classList.remove('active');
                document.getElementById('foodList').style.display = '';
                var tabBtns = document.querySelectorAll('.food-tab-btn');
                tabBtns.forEach(function(b) {
                    b.classList.toggle('active', b.dataset.level === 'low');
                });
                self.renderFoods('low');
            });
        });
    },

    // 根据当前营养素更新页面文案
    updateFoodMineralUI() {
        var m = this.foodMineral; // 'k' | 'p' | 'pr'
        var titles = {
            k: '钾含量食物参考',
            p: '磷含量食物参考',
            pr: '优质蛋白食物参考'
        };
        var intros = {
            k: '透析患者需控制钾摄入，每日建议 <strong>2-3g</strong> 钾。',
            p: '透析患者需控制磷摄入，每日建议 <strong>800-1000mg</strong> 磷。<br>💡 优选磷/蛋白比低的食物（如鸡蛋白）；加工食品中的无机磷吸收率近100%，尽量避免。',
            pr: '透析患者需<strong>保证</strong>蛋白质摄入，每日建议 <strong>1.0-1.2g/kg</strong> 体重，其中一半以上来自优质蛋白（蛋、奶、鱼、肉、大豆）。<br>💡 与钾磷不同：蛋白质按量吃够而不是越少越好；优选磷/蛋白比低的食物（标⭐者）。'
        };
        var disclaimers = {
            k: '仅供参考，具体以实际食物钾含量为准',
            p: '仅供参考，具体以实际食物磷含量为准',
            pr: '仅供参考，具体以实际食物蛋白含量为准'
        };
        var sources = {
            k: '数据来源：《中国食物成分表·标准版（第6版）》+ 武汉第三医院/复旦中山医院透析患者饮食指南',
            p: '数据来源：《中国食物成分表·标准版（第6版）》、USDA FoodData Central 及医院卫教资料；数值为每100g可食部近似值，因品种、产地、加工方式而异',
            pr: '数据来源：《中国食物成分表·标准版（第6版）》、USDA FoodData Central；磷/蛋白比参照 KDOQI 透析营养指南及医院卫教资料；数值为每100g可食部近似值'
        };
        document.getElementById('foodCardTitle').textContent = titles[m] || titles.k;
        document.getElementById('foodIntro').innerHTML = intros[m] || intros.k;
        document.getElementById('foodDisclaimer').textContent = disclaimers[m] || disclaimers.k;
        document.getElementById('foodSource').textContent = sources[m] || sources.k;

        var labels = {
            k: { low: '低钾', mid: '中钾', high: '高钾' },
            p: { low: '低磷', mid: '中磷', high: '高磷' },
            pr: { low: '低蛋白', mid: '中蛋白', high: '高蛋白' }
        }[m];
        var ranges = {
            k: { low: '<150mg', mid: '150-250mg', high: '>250mg' },
            p: { low: '<100mg', mid: '100-300mg', high: '>300mg' },
            pr: { low: '<5g', mid: '5-15g', high: '>15g' }
        }[m];
        document.querySelectorAll('.food-tab-btn').forEach(function(btn) {
            btn.querySelector('.food-tab-label').textContent = labels[btn.dataset.level];
            btn.querySelector('.food-tab-range').textContent = ranges[btn.dataset.level];
        });

        // 蛋白模式下颜色语义反转：高蛋白=绿色（推荐），低蛋白=中性灰
        document.getElementById('tab-foods').classList.toggle('protein-mode', m === 'pr');
    },

    // 获取当前营养素的食物数据集
    getFoodDataSet(level) {
        var data = { k: FOOD_DATA, p: PHOS_DATA, pr: PROTEIN_DATA }[this.foodMineral || 'k'];
        return data[level];
    },

    // 获取食物的营养素数值
    getFoodVal(f) {
        if (this.foodMineral === 'p') return f.p;
        if (this.foodMineral === 'pr') return f.pr;
        return f.k;
    },

    // 获取营养素单位（蛋白为 g/100g，其余为 mg/100g）
    getFoodUnit() {
        return this.foodMineral === 'pr' ? ' g/100g' : ' mg/100g';
    },

    // 食物分类 Tab
    initFoodTabs() {
        var self = this;
        var tabBtns = document.querySelectorAll('.food-tab-btn');
        tabBtns.forEach(function(btn) {
            btn.addEventListener('click', function() {
                tabBtns.forEach(function(b) { b.classList.remove('active'); });
                btn.classList.add('active');
                // 清空搜索框，显示分类列表
                document.getElementById('foodSearch').value = '';
                document.getElementById('foodSearchResult').classList.remove('active');
                self.renderFoods(btn.dataset.level);
            });
        });

        // 搜索框实时筛选（带节流，避免输入卡顿）
        var searchInput = document.getElementById('foodSearch');
        var searchTimer = null;
        searchInput.addEventListener('input', function() {
            var keyword = this.value.trim().toLowerCase();
            var resultBox = document.getElementById('foodSearchResult');
            var foodList = document.getElementById('foodList');

            // 立即清空旧结果，避免显示过时内容
            if (keyword === '') {
                resultBox.classList.remove('active');
                foodList.style.display = '';
                return;
            }

            // 节流：输入后 150ms 才执行搜索
            clearTimeout(searchTimer);
            searchTimer = setTimeout(function() {
                foodList.style.display = 'none';
                resultBox.classList.add('active');
                self.searchFoods(keyword);
            }, 150);
        });

        // 阻止 iOS 下聚焦时页面缩放
        searchInput.addEventListener('focus', function() {
            this.style.fontSize = '16px';
        });
    },

    // 搜索食物
    searchFoods(keyword) {
        var results = [];
        var levels = ['low', 'mid', 'high'];
        var m = this.foodMineral || 'k';
        var levelNames = {
            k: { low: '低钾', mid: '中钾', high: '高钾' },
            p: { low: '低磷', mid: '中磷', high: '高磷' },
            pr: { low: '低蛋白', mid: '中蛋白', high: '高蛋白' }
        }[m];
        var dataset = { k: FOOD_DATA, p: PHOS_DATA, pr: PROTEIN_DATA }[m];
        var getVal = { k: function(f) { return f.k; }, p: function(f) { return f.p; }, pr: function(f) { return f.pr; } }[m];
        var unit = m === 'pr' ? ' g/100g' : ' mg/100g';

        // 遍历所有食物数据
        levels.forEach(function(level) {
            var foodData = dataset[level];
            var keys = Object.keys(foodData.categories);
            keys.forEach(function(category) {
                var foods = foodData.categories[category];
                foods.forEach(function(f) {
                    if (f.name.toLowerCase().indexOf(keyword) !== -1 ||
                        f.tip.toLowerCase().indexOf(keyword) !== -1 ||
                        category.toLowerCase().indexOf(keyword) !== -1) {
                        results.push({
                            name: f.name,
                            val: getVal(f),
                            tip: f.tip,
                            level: level,
                            levelName: levelNames[level],
                            category: category
                        });
                    }
                });
            });
        });

        var resultBox = document.getElementById('foodSearchResult');

        if (results.length === 0) {
            resultBox.innerHTML = '<div class="food-search-empty">未找到相关食物，试试其他关键词？</div>';
            return;
        }

        // 按含量从低到高排序
        results.sort(function(a, b) { return a.val - b.val; });

        var html = '<div class="food-search-result-title">找到 ' + results.length + ' 种食物</div>';
        html += '<div class="food-grid">';
        results.forEach(function(r) {
            html += '<div class="food-item ' + r.level + '">' +
                '<div class="food-item-name">' + r.name + '</div>' +
                '<div class="food-item-k">' + r.val + unit + '</div>' +
                '<div class="food-item-tip">' + r.levelName + ' · ' + r.category + '</div>' +
                '</div>';
        });
        html += '</div>';

        resultBox.innerHTML = html;
    },

    // 渲染食物列表（按类别折叠）
    renderFoods(level) {
        var self = this;
        const list = document.getElementById('foodList');
        const foodData = this.getFoodDataSet(level);

        if (!foodData) return;

        let html = `<p class="food-intro"><strong>${foodData.title}</strong><br>${foodData.tip}</p>`;

        var keys = Object.keys(foodData.categories);
        for (var i = 0; i < keys.length; i++) {
            var category = keys[i];
            var foods = foodData.categories[category];
            var foodItemsHtml = foods.map(function(f) {
                return '<div class="food-item ' + level + '">' +
                    '<div class="food-item-name">' + f.name + '</div>' +
                    '<div class="food-item-k">' + self.getFoodVal(f) + self.getFoodUnit() + '</div>' +
                    '<div class="food-item-tip">' + f.tip + '</div>' +
                    '</div>';
            }).join('');
            // 第一个类别默认展开，其余折叠
            var expanded = (i === 0);
            html += '<div class="food-category-group' + (expanded ? ' expanded' : '') + '">' +
                '<div class="food-category-header" onclick="App.toggleFoodCategory(this)">' +
                    '<span class="food-category-toggle">' + (expanded ? '▼' : '▶') + '</span>' +
                    '<span class="food-category-name">' + category + '</span>' +
                    '<span class="food-category-count">' + foods.length + ' 种</span>' +
                '</div>' +
                '<div class="food-category-body"' + (expanded ? '' : ' style="display:none"') + '>' +
                    '<div class="food-grid">' + foodItemsHtml + '</div>' +
                '</div>' +
            '</div>';
        }

        list.innerHTML = html;
    },

    // 展开/折叠食物类别
    toggleFoodCategory(headerEl) {
        var group = headerEl.parentNode;
        var body = headerEl.nextElementSibling;
        var icon = headerEl.querySelector('.food-category-toggle');
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

    // PWA 安装
    initPWA() {
        let deferredPrompt = null;

        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            document.getElementById('installBtn').classList.remove('hidden');
        });

        document.getElementById('installBtn').addEventListener('click', function() {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                deferredPrompt.userChoice.then(function(choiceResult) {
                    if (choiceResult.outcome === 'accepted') {
                        this.showToast('安装成功！');
                    }
                    deferredPrompt = null;
                    document.getElementById('installBtn').classList.add('hidden');
                }.bind(this));
            } else {
                this.showToast('请使用浏览器菜单"添加到主屏幕"');
            }
        }.bind(this));

        window.addEventListener('appinstalled', () => {
            document.getElementById('installBtn').classList.add('hidden');
        });
    },

    // Toast 提示
    showToast(message) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.classList.add('show');

        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => {
            toast.classList.remove('show');
        }, 2000);
    }
};

// 启动应用
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

// ===== iOS 键盘弹收适配 =====
// 键盘收起后，页面可能被推上去不回弹
function fixIOSKeyboard() {
    // 输入框失焦时，滚动回顶部偏移
    document.addEventListener('blur', function(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            // 小延迟等键盘动画完成
            setTimeout(function() {
                window.scrollTo(0, 0);
                document.body.scrollTop = 0;
            }, 50);
        }
    }, true);

    // 点击空白区域时，让当前输入框失焦（收起键盘）
    document.addEventListener('click', function(e) {
        if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'SELECT') {
            var active = document.activeElement;
            if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
                active.blur();
            }
        }
    });
}

// 确保输入框能获取焦点（iOS PWA 兼容）
function enhanceInputs() {
    var inputs = document.querySelectorAll('input, textarea');
    inputs.forEach(function(el) {
        // 阻止 iOS 下双击才能聚焦的问题
        el.style.cursor = 'text';
    });
}

document.addEventListener('DOMContentLoaded', function() {
    fixIOSKeyboard();
    enhanceInputs();
});
