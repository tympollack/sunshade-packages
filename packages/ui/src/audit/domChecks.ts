import type { AuditViolation } from './types';

/**
 * Browser-context DOM audit evaluator executed via Playwright `page.evaluate`.
 * Returns selector-pinpointed layout, mobile tap-target, wrapping, scroll-clipping,
 * and image integrity violations for the current viewport.
 */
export function evaluateDomGuardrails(viewportWidth: number): AuditViolation[] {
  const violations: AuditViolation[] = [];

  const buildSelector = (el: Element): string => {
    const testId = el.getAttribute('data-testid');
    if (testId) return `[data-testid="${testId}"]`;
    if (el.id) return `#${el.id}`;

    const parts: string[] = [];
    let current: Element | null = el;
    while (current && current.nodeType === 1 && parts.length < 4) {
      let part = current.tagName.toLowerCase();
      const cls =
        typeof current.className === 'string'
          ? current.className
              .trim()
              .split(/\s+/)
              .filter((c) => c && !c.includes(':') && !c.includes('[') && !c.includes('/'))
              .slice(0, 2)
          : [];
      if (cls.length > 0) {
        part += `.${cls.join('.')}`;
      }
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (child) => child.tagName === current!.tagName
        );
        if (siblings.length > 1) {
          part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
        }
      }
      parts.unshift(part);
      current = current.parentElement;
    }
    return parts.join(' > ');
  };

  const isVisible = (el: Element): boolean => {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const isInsideHorizontalScroller = (el: Element): boolean => {
    let parent = el.parentElement;
    while (parent && parent !== document.body && parent !== document.documentElement) {
      const style = window.getComputedStyle(parent);
      if (style.overflowX === 'auto' || style.overflowX === 'scroll') {
        return true;
      }
      parent = parent.parentElement;
    }
    return false;
  };

  // 1. Horizontal Overflow Check
  const docScrollWidth = document.documentElement.scrollWidth;
  if (docScrollWidth > viewportWidth + 1) {
    const offenders: string[] = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      if (!isVisible(el)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.right > viewportWidth + 1 && !isInsideHorizontalScroller(el)) {
        offenders.push(buildSelector(el));
        if (offenders.length >= 3) break;
      }
    }
    violations.push({
      category: 'horizontal-overflow',
      severity: 'error',
      selector: offenders[0] || 'html',
      message: `Document scrollWidth (${docScrollWidth}px) exceeds viewport width (${viewportWidth}px)`,
      details: offenders.length > 0 ? `Overflowing elements: ${offenders.join(', ')}` : undefined,
    });
  }

  // 2. Clipped Interactive Controls & Mobile Tap Targets
  const interactiveSelector = 'button, a, [role="button"], input:not([type="hidden"]), select, textarea';
  const interactiveEls = Array.from(document.querySelectorAll(interactiveSelector)).filter(isVisible);
  const interactiveRects: Array<{ el: Element; selector: string; rect: DOMRect }> = [];

  for (const el of interactiveEls) {
    const rect = el.getBoundingClientRect();
    const selector = buildSelector(el);
    interactiveRects.push({ el, selector, rect });

    if ((rect.left < -1 || rect.right > viewportWidth + 1) && !isInsideHorizontalScroller(el)) {
      violations.push({
        category: 'clipped-control',
        severity: 'error',
        selector,
        message: `Interactive control extends outside [0, ${viewportWidth}] viewport bounds (left=${Math.round(rect.left)}, right=${Math.round(rect.right)})`,
      });
    }

    if (viewportWidth < 768) {
      const style = window.getComputedStyle(el);
      const isInlineProseLink =
        el.tagName === 'A' &&
        style.display === 'inline' &&
        Boolean(el.closest('p, li, blockquote, article'));

      if (!isInlineProseLink && (rect.width < 32 || rect.height < 32)) {
        violations.push({
          category: 'small-tap-target',
          severity: 'error',
          selector,
          message: `Mobile tap target is ${Math.round(rect.width)}x${Math.round(rect.height)}px (minimum 32x32px required)`,
        });
      }
    }
  }

  // 3. Overlapping Sibling Interactive Bounding Boxes (Mobile < 768px)
  if (viewportWidth < 768) {
    for (let i = 0; i < interactiveRects.length; i++) {
      for (let j = i + 1; j < interactiveRects.length; j++) {
        const a = interactiveRects[i];
        const b = interactiveRects[j];
        if (a.el.parentElement !== b.el.parentElement) continue;
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;

        const overlapX = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
        const overlapY = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
        if (overlapX > 2 && overlapY > 2) {
          violations.push({
            category: 'overlapping-controls',
            severity: 'error',
            selector: `${a.selector} <> ${b.selector}`,
            message: `Sibling interactive controls overlap by ${Math.round(overlapX)}x${Math.round(overlapY)}px on mobile`,
          });
        }
      }
    }

    // 4. Missing Mobile Nav Trigger when Desktop Sidebar is Hidden
    const navElements = Array.from(document.querySelectorAll('aside, nav, [role="navigation"]'));
    const hasHiddenDesktopNav = navElements.some((navEl) => {
      const style = window.getComputedStyle(navEl);
      return style.display === 'none';
    });

    if (hasHiddenDesktopNav) {
      const hasVisibleNavTrigger = interactiveEls.some((el) => {
        const label = (
          el.getAttribute('aria-label') ||
          el.getAttribute('data-testid') ||
          el.textContent ||
          ''
        ).toLowerCase();
        return (
          el.hasAttribute('aria-controls') ||
          el.hasAttribute('aria-expanded') ||
          label.includes('menu') ||
          label.includes('nav') ||
          label.includes('sidebar') ||
          label.includes('drawer')
        );
      });

      if (!hasVisibleNavTrigger) {
        violations.push({
          category: 'missing-mobile-nav',
          severity: 'error',
          selector: 'header',
          message: 'Desktop navigation/sidebar is hidden below 768px with no visible mobile drawer toggle button',
        });
      }
    }
  }

  // 5. Multi-Row Text Wrapping Inside Nowrap Badges/Buttons
  const nowrapCandidates = Array.from(
    document.querySelectorAll('button, [role="button"], [class*="badge"], [class*="whitespace-nowrap"]')
  ).filter(isVisible);

  for (const el of nowrapCandidates) {
    const classStr = typeof el.className === 'string' ? el.className : '';
    const style = window.getComputedStyle(el);
    const expectsSingleLine =
      classStr.includes('whitespace-nowrap') || style.whiteSpace === 'nowrap';
    if (!expectsSingleLine) continue;

    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (!node.textContent || !node.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const rects = range.getClientRects();
      if (rects.length > 1) {
        violations.push({
          category: 'unexpected-text-wrap',
          severity: 'error',
          selector: buildSelector(el),
          message: `Unexpected multi-line text wrapping (${rects.length} client rects) inside nowrap badge/button`,
          details: node.textContent.trim().slice(0, 60),
        });
        break;
      }
    }
  }

  // 6. Over-wide Prose Blocks (> 760px)
  const proseCandidates = Array.from(
    document.querySelectorAll('p, article, [class*="prose"]')
  ).filter(isVisible);

  for (const el of proseCandidates) {
    const rect = el.getBoundingClientRect();
    const textLen = (el.textContent || '').trim().length;
    if (rect.width > 760 && textLen >= 120) {
      violations.push({
        category: 'overwide-prose',
        severity: 'error',
        selector: buildSelector(el),
        message: `Prose block width (${Math.round(rect.width)}px) exceeds 760px readability threshold`,
      });
    }
  }

  // 7. Clipped Scrollable Containers (overflow-y: hidden with vertical overflow)
  const allElements = Array.from(document.querySelectorAll('body *')).filter(isVisible);
  for (const el of allElements) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'svg' || tag === 'path' || tag === 'input' || tag === 'textarea' || tag === 'select') {
      continue;
    }
    const style = window.getComputedStyle(el);
    if (style.display === 'inline') {
      continue;
    }
    const classStr = typeof el.className === 'string' ? el.className : '';
    if (
      style.textOverflow === 'ellipsis' ||
      classStr.includes('truncate') ||
      classStr.includes('line-clamp')
    ) {
      continue;
    }
    if (
      (style.overflowY === 'hidden' || style.overflowY === 'clip') &&
      el.clientHeight > 0 &&
      el.scrollHeight > el.clientHeight + 4
    ) {
      violations.push({
        category: 'clipped-scroll-container',
        severity: 'error',
        selector: buildSelector(el),
        message: `Container clips vertical content (scrollHeight=${el.scrollHeight}px > clientHeight=${el.clientHeight}px) without overflow-y: auto|scroll`,
      });
    }
  }

  // 8. Asset Integrity (visible <img> elements)
  for (const img of Array.from(document.querySelectorAll('img')).filter(isVisible)) {
    if (!img.complete || img.naturalWidth === 0) {
      violations.push({
        category: 'broken-image',
        severity: 'error',
        selector: buildSelector(img),
        message: `Visible <img> failed to load (complete=${img.complete}, naturalWidth=${img.naturalWidth})`,
        details: img.getAttribute('src') || undefined,
      });
    }
  }

  return violations;
}
