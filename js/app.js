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

// 应用数据修订：同名食物保留与权威值一致的条目，删除矛盾条目（含跨档位冲突）
function applyFoodFixes(db, fixMap, field) {
    if (!db || !fixMap) return;
    // 第一遍：收集每个食物名在各档位出现的条目
    var seen = {};
    ['low', 'mid', 'high'].forEach(function(level) {
        var cats = db[level].categories || {};
        Object.keys(cats).forEach(function(cat) {
            cats[cat] = cats[cat].filter(function(f) {
                if (!fixMap.hasOwnProperty(f.name)) return true;
                var correct = fixMap[f.name];
                if (f[field] !== correct) return false; // 与权威值不符，删除
                var key = f.name;
                if (seen[key]) return false;             // 已保留过一条，去重
                seen[key] = true;
                return true;
            });
        });
    });
}

var App = {
    // Toast 定时器
    toastTimer: null,

    // 初始化
    init() {
        // 1) 合并扩充食物数据（钾/磷/优质蛋白）
        if (typeof FOOD_EXTRA !== 'undefined') {
            mergeFoodData(FOOD_DATA, FOOD_EXTRA.k);
            mergeFoodData(PHOS_DATA, FOOD_EXTRA.p);
            mergeFoodData(PROTEIN_DATA, FOOD_EXTRA.pr);
        }
        // 2) 应用数据修订：全库合并后统一清理同名矛盾条目（依据第6版）
        if (typeof FOOD_FIX_DATA !== 'undefined') {
            applyFoodFixes(FOOD_DATA, FOOD_FIX_DATA.fix.k, 'k');
            applyFoodFixes(PHOS_DATA, FOOD_FIX_DATA.fix.p, 'p');
            applyFoodFixes(PROTEIN_DATA, FOOD_FIX_DATA.fix.pr, 'pr');
        }
        // 3) 合并本次新增食物（与既有名称不冲突）
        if (typeof FOOD_FIX_DATA !== 'undefined') {
            mergeFoodData(FOOD_DATA, FOOD_FIX_DATA.add.k);
            mergeFoodData(PHOS_DATA, FOOD_FIX_DATA.add.p);
            mergeFoodData(PROTEIN_DATA, FOOD_FIX_DATA.add.pr);
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
        this.foodSearchQuery = '';
        this.foodSortMode = false;
        this.currentFoodLevel = 'low';
        var btns = document.querySelectorAll('.mineral-switch-btn');
        btns.forEach(function(btn) {
            btn.addEventListener('click', function() {
                if (self.foodMineral === btn.dataset.mineral) return;
                btns.forEach(function(b) { b.classList.remove('active'); });
                btn.classList.add('active');
                self.foodMineral = btn.dataset.mineral;
                self.updateFoodMineralUI();

                // 搜索词保留：切到磷/蛋白后直接看同一食物的另一项指标
                // 档位重置回"低"，视图按搜索词自动决定
                var tabBtns = document.querySelectorAll('.food-tab-btn');
                tabBtns.forEach(function(b) {
                    b.classList.toggle('active', b.dataset.level === 'low');
                });
                self.currentFoodLevel = 'low';
                self.applyFoodView();
            });
        });
    },

    // 统一决定食物视图：有搜索词显示搜索结果，否则显示分类列表
    applyFoodView() {
        var resultBox = document.getElementById('foodSearchResult');
        var foodList = document.getElementById('foodList');
        var q = (this.foodSearchQuery || '').trim();
        if (q !== '') {
            foodList.style.display = 'none';
            resultBox.classList.add('active');
            this.searchFoods(q.toLowerCase());
        } else {
            resultBox.classList.remove('active');
            resultBox.innerHTML = '';
            foodList.style.display = '';
            this.renderFoods(this.currentFoodLevel || 'low');
        }
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
                // 搜索词保留：同一食物在低/中/高档间切换查看
                self.currentFoodLevel = btn.dataset.level;
                self.applyFoodView();
            });
        });

        // 搜索框实时筛选（带节流，避免输入卡顿）
        var searchInput = document.getElementById('foodSearch');
        var searchTimer = null;
        searchInput.addEventListener('input', function() {
            var keyword = this.value.trim().toLowerCase();
            self.foodSearchQuery = keyword;
            var resultBox = document.getElementById('foodSearchResult');
            var foodList = document.getElementById('foodList');

            // 立即清空旧结果，避免显示过时内容
            if (keyword === '') {
                resultBox.classList.remove('active');
                foodList.style.display = '';
                self.renderFoods(self.currentFoodLevel || 'low');
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

    // 渲染食物列表（按类别折叠，支持自定义类别顺序）
    renderFoods(level) {
        var self = this;
        this.currentFoodLevel = level;
        const list = document.getElementById('foodList');
        const foodData = this.getFoodDataSet(level);

        if (!foodData) return;

        let html = `<p class="food-intro"><strong>${foodData.title}</strong><br>${foodData.tip}</p>`;

        // 按用户保存的顺序排列类别（未保存过的类别按原始顺序排在后面）
        var savedOrder = this.getFoodCategoryOrder();
        var keys = Object.keys(foodData.categories);
        keys.sort(function(a, b) {
            var ia = savedOrder.indexOf(a), ib = savedOrder.indexOf(b);
            if (ia === -1 && ib === -1) return 0;
            if (ia === -1) return 1;
            if (ib === -1) return -1;
            return ia - ib;
        });

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
            // 第一个类别默认展开，其余折叠；排序模式下全部折叠（只看主类目，方便整体调序）
            var expanded = this.foodSortMode ? false : (i === 0);
            var sortControls = '';
            var headerClass = 'food-category-header';
            var headerClick = 'App.toggleFoodCategory(this)';
            var groupClass = 'food-category-group';
            if (this.foodSortMode) {
                headerClass += ' sort-mode';
                headerClick = '';
                groupClass += ' sort-draggable';
                sortControls = '<span class="food-drag-handle" aria-label="按住拖动排序">≡</span>';
            }
            html += '<div class="' + groupClass + (expanded ? ' expanded' : '') + '" data-cat="' + encodeURIComponent(category) + '">' +
                '<div class="' + headerClass + '"' + (headerClick ? ' onclick="' + headerClick + '"' : '') + '>' +
                    '<span class="food-category-toggle">' + (expanded ? '▼' : '▶') + '</span>' +
                    '<span class="food-category-name">' + category + '</span>' +
                    '<span class="food-category-count">' + foods.length + ' 种</span>' +
                    sortControls +
                '</div>' +
                '<div class="food-category-body"' + (expanded ? '' : ' style="display:none"') + '>' +
                    '<div class="food-grid">' + foodItemsHtml + '</div>' +
                '</div>' +
            '</div>';
        }

        list.innerHTML = html;
        if (this.foodSortMode) this.initFoodDrag();
    },

    // ===== 类别自定义排序 =====

    // 读取用户保存的类别顺序（全局共享：钾/磷/蛋白三视图用同一份顺序，
    // 类别名能匹配上的按保存顺序排，匹配不上的按原始顺序补在后面）
    getFoodCategoryOrder() {
        try {
            var raw = localStorage.getItem('food_cat_order');
            var arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr : [];
        } catch (e) { return []; }
    },

    // 保存类别顺序
    saveFoodCategoryOrder(order) {
        localStorage.setItem('food_cat_order', JSON.stringify(order));
    },

    // 计算当前有效顺序（保存的顺序 + 未保存的类别按原始顺序补齐）
    getEffectiveCategoryOrder() {
        var foodData = this.getFoodDataSet(this.currentFoodLevel || 'low');
        var keys = Object.keys(foodData.categories);
        var saved = this.getFoodCategoryOrder().filter(function(k) { return keys.indexOf(k) !== -1; });
        var rest = keys.filter(function(k) { return saved.indexOf(k) === -1; });
        return saved.concat(rest);
    },

    // 进入/退出排序模式
    toggleFoodSortMode() {
        this.foodSortMode = !this.foodSortMode;
        var btn = document.getElementById('foodSortBtn');
        var hint = document.getElementById('foodSortHint');
        if (btn) {
            btn.textContent = this.foodSortMode ? '✓ 完成' : '⇅ 调整类别顺序';
            btn.classList.toggle('sorting', this.foodSortMode);
        }
        if (hint) hint.classList.toggle('hidden', !this.foodSortMode);
        // 排序时强制切到分类列表视图
        if (this.foodSortMode) {
            this.foodSearchQuery = '';
            document.getElementById('foodSearch').value = '';
            document.getElementById('foodSearchResult').classList.remove('active');
            document.getElementById('foodSearchResult').innerHTML = '';
            document.getElementById('foodList').style.display = '';
        }
        this.renderFoods(this.currentFoodLevel || 'low');
    },

    // 拖动排序：在排序模式下给每个类别挂手柄拖拽交互（触摸 + 鼠标）
    initFoodDrag() {
        var self = this;
        var list = document.getElementById('foodList');
        if (!list) return;

        var handles = list.querySelectorAll('.food-drag-handle');
        handles.forEach(function(handle) {
            // 触摸端
            handle.addEventListener('touchstart', function(e) {
                e.preventDefault();
                self.startFoodDrag(e.touches[0].clientY, handle);
            }, { passive: false });
            handle.addEventListener('touchmove', function(e) {
                e.preventDefault();
                if (self.dragState) self.onFoodDragMove(e.touches[0].clientY);
            }, { passive: false });
            handle.addEventListener('touchend', function(e) {
                e.preventDefault();
                self.endFoodDrag();
            }, { passive: false });
            handle.addEventListener('touchcancel', function() { self.endFoodDrag(); });

            // 鼠标端（桌面调试）
            handle.addEventListener('mousedown', function(e) {
                e.preventDefault();
                self.startFoodDrag(e.clientY, handle);
            });
        });

        if (!this._foodDragBound) {
            this._foodDragBound = true;
            document.addEventListener('mousemove', function(e) {
                if (self.dragState) self.onFoodDragMove(e.clientY);
            });
            document.addEventListener('mouseup', function() {
                if (self.dragState) self.endFoodDrag();
            });
        }
    },

    // 开始拖动（由手柄事件触发，直接定位手柄所属类别）
    startFoodDrag(clientY, handleEl) {
        var target = handleEl ? handleEl.closest('.food-category-group') : null;
        if (!target) {
            var list = document.getElementById('foodList');
            var groups = list ? list.querySelectorAll('.food-category-group') : [];
            for (var i = 0; i < groups.length; i++) {
                var r = groups[i].getBoundingClientRect();
                if (clientY >= r.top && clientY <= r.bottom) { target = groups[i]; break; }
            }
        }
        if (!target) return;

        this.dragState = { el: target, startY: clientY, order: this.getEffectiveCategoryOrder() };
        target.classList.add('dragging');
        if (navigator.vibrate) navigator.vibrate(10);
    },

    // 拖动中：根据指针 Y 位置计算应插入的位置并实时交换
    onFoodDragMove(clientY) {
        var st = this.dragState;
        if (!st) return;
        var list = document.getElementById('foodList');
        var groups = Array.prototype.slice.call(list.querySelectorAll('.food-category-group'));
        var fromIdx = groups.indexOf(st.el);
        if (fromIdx === -1) return;

        // 找指针当前覆盖的类别
        var toIdx = fromIdx;
        for (var i = 0; i < groups.length; i++) {
            if (groups[i] === st.el) continue;
            var r = groups[i].getBoundingClientRect();
            var mid = r.top + r.height / 2;
            if (clientY >= r.top && clientY <= r.bottom) { toIdx = i; break; }
        }
        if (toIdx === fromIdx) return;

        // DOM 交换后立即重排顺序数组并保存
        if (toIdx > fromIdx) {
            st.el.parentNode.insertBefore(groups[toIdx], st.el.nextSibling);
        } else {
            st.el.parentNode.insertBefore(st.el, groups[toIdx]);
        }
        // 同步顺序数组
        var names = Array.prototype.slice.call(
            list.querySelectorAll('.food-category-group')
        ).map(function(g) { return decodeURIComponent(g.dataset.cat); });
        this.saveFoodCategoryOrder(names);
        st.order = names;
    },

    // 结束拖动
    endFoodDrag() {
        var st = this.dragState;
        if (!st) return;
        st.el.classList.remove('dragging');
        this.dragState = null;
        // 用当前 DOM 顺序落盘，保证与视觉一致
        var list = document.getElementById('foodList');
        var names = Array.prototype.slice.call(
            list.querySelectorAll('.food-category-group')
        ).map(function(g) { return decodeURIComponent(g.dataset.cat); });
        this.saveFoodCategoryOrder(names);
    },

    // 上移/下移类别（保留：供无触摸环境或键盘操作）
    moveFoodCategory(catEncoded, dir) {
        var name = decodeURIComponent(catEncoded);
        var order = this.getEffectiveCategoryOrder();
        var idx = order.indexOf(name);
        var swap = idx + dir;
        if (idx === -1 || swap < 0 || swap >= order.length) return;
        var tmp = order[idx];
        order[idx] = order[swap];
        order[swap] = tmp;
        this.saveFoodCategoryOrder(order);
        this.renderFoods(this.currentFoodLevel || 'low');
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
