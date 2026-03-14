import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const BASE_URL = 'http://127.0.0.1:6680/';

function intersects(a, b) {
  if (!a || !b) return false;
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

async function closePopup(page, selector) {
  await page.evaluate((sel) => {
    document.querySelector(sel)?.classList.remove('show');
  }, selector);
}

async function expectPopupOpens(page, buttonSelector, popupSelector) {
  await page.locator(buttonSelector).click();
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    return !!el && el.classList.contains('show');
  }, popupSelector);
  await closePopup(page, popupSelector);
}

async function setupPortalState(page) {
  await page.evaluate(() => {
    localStorage.setItem('sso_onboard_done_v1', '1');
    document.getElementById('onboardOverlay')?.classList.remove('show');
    document.getElementById('installModal')?.classList.remove('active');

    window.currentUser = 'ui-playwright';
    window.isAuthenticated = true;
    window.isEditable = true;
    window.userRole = 'admin';
    window.searchKeyword = '';
    window.selectedDepartment = '';
    window.selectedTag = '';
    window.groupMode = 'env';
    window.languageMode = 'zh';
    window.favoriteKeys = ['id:9001'];
    window.systems = [
      {
        id: 9001,
        name: '前端回归样例系统',
        url: 'https://example.com/login',
        env: 'test',
        type: 'basic',
        username: 'tester',
        password: 'secret',
        notes: '用于 UI 自动化回归',
        pinned: true,
        department: 'QA',
        tags: ['回归'],
      },
    ];

    renderAdminWorkbench();
    renderSupportHub();
    renderFocusWorkbench();
    renderSystems();
  });
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.renderAdminWorkbench === 'function' && typeof window.renderSystems === 'function');
  await setupPortalState(page);

  await expectPopupOpens(page, '#adminWorkbench button:has-text("立即扫描")', '#healthPopup');
  await expectPopupOpens(page, '#adminWorkbench button:has-text("打开审计")', '#auditPopup');
  await expectPopupOpens(page, '#adminWorkbench button:has-text("管理备份")', '#backupPopup');
  await expectPopupOpens(page, '#adminWorkbench button:has-text("查看版本")', '#updateCenterPopup');

  await expectPopupOpens(page, '#supportHub button:has-text("使用指南")', '#guidePopup');
  await expectPopupOpens(page, '#supportHub button:has-text("支持范围")', '#supportedPopup');
  await expectPopupOpens(page, '#supportHub button:has-text("更新日志")', '#changelogPopup');
  await expectPopupOpens(page, '#supportHub button:has-text("打开留言板")', '#msgPopup');

  await expectPopupOpens(page, '.focus-actions button:has-text("📖 使用指南")', '#guidePopup');
  await expectPopupOpens(page, '.focus-step-actions button:has-text("查看更新中心")', '#updateCenterPopup');

  const card = page.locator('#systemsContainer .card').first();
  await assert.ok(await card.count(), '系统卡片应已渲染');

  await page.evaluate(() => document.body.classList.remove('enterprise-density'));
  await card.hover();
  const favoriteBox = await page.locator('#systemsContainer .card .card-favorite-btn').first().boundingBox();
  const deleteBox = await page.locator('#systemsContainer .card .card-actions .del').first().boundingBox();
  assert.ok(favoriteBox && deleteBox, '收藏/删除按钮都应可见');
  assert.equal(intersects(favoriteBox, deleteBox), false, '默认密度下收藏与删除按钮不应重叠');

  await page.evaluate(() => {
    document.body.classList.add('enterprise-density');
    renderSystems();
  });
  const denseCard = page.locator('#systemsContainer .card').first();
  await denseCard.hover();
  const denseFavoriteBox = await page.locator('#systemsContainer .card .card-favorite-btn').first().boundingBox();
  const denseDeleteBox = await page.locator('#systemsContainer .card .card-actions .del').first().boundingBox();
  assert.ok(denseFavoriteBox && denseDeleteBox, '紧凑模式下收藏/删除按钮都应可见');
  assert.equal(intersects(denseFavoriteBox, denseDeleteBox), false, '紧凑模式下收藏与删除按钮不应重叠');

  console.log('test_frontend_ui_playwright: all checks passed');
} finally {
  await browser.close();
}
