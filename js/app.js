// ========== 主应用逻辑 ==========

var App = {
    // Toast 定时器
    toastTimer: null,

    // 初始化
    init() {
        this.initTabNav();
        this.initFoodTabs();
        this.initPWA();

        // 初始化各模块
        RecordManager.init();
        TaskManager.init();
        StatsManager.init();

        // 初始渲染食物
        this.renderFoods('low');

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
        var levelNames = { low: '低钾', mid: '中钾', high: '高钾' };

        // 遍历所有食物数据
        levels.forEach(function(level) {
            var foodData = FOOD_DATA[level];
            var keys = Object.keys(foodData.categories);
            keys.forEach(function(category) {
                var foods = foodData.categories[category];
                foods.forEach(function(f) {
                    if (f.name.toLowerCase().indexOf(keyword) !== -1 ||
                        f.tip.toLowerCase().indexOf(keyword) !== -1 ||
                        category.toLowerCase().indexOf(keyword) !== -1) {
                        results.push({
                            name: f.name,
                            k: f.k,
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

        // 按钾含量从低到高排序
        results.sort(function(a, b) { return a.k - b.k; });

        var html = '<div class="food-search-result-title">找到 ' + results.length + ' 种食物</div>';
        html += '<div class="food-grid">';
        results.forEach(function(r) {
            html += '<div class="food-item ' + r.level + '">' +
                '<div class="food-item-name">' + r.name + '</div>' +
                '<div class="food-item-k">' + r.k + ' mg/100g</div>' +
                '<div class="food-item-tip">' + r.levelName + ' · ' + r.category + '</div>' +
                '</div>';
        });
        html += '</div>';

        resultBox.innerHTML = html;
    },

    // 渲染食物列表（按类别折叠）
    renderFoods(level) {
        const list = document.getElementById('foodList');
        const foodData = FOOD_DATA[level];

        if (!foodData) return;

        let html = `<p class="food-intro"><strong>${foodData.title}</strong><br>${foodData.tip}</p>`;

        var keys = Object.keys(foodData.categories);
        for (var i = 0; i < keys.length; i++) {
            var category = keys[i];
            var foods = foodData.categories[category];
            var foodItemsHtml = foods.map(function(f) {
                return '<div class="food-item ' + level + '">' +
                    '<div class="food-item-name">' + f.name + '</div>' +
                    '<div class="food-item-k">' + f.k + ' mg/100g</div>' +
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
