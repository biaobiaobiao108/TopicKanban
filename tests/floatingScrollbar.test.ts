import { describe, expect, it } from 'bun:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { FloatingScrollbar } from '../src/components/ui/FloatingScrollbar';

describe('FloatingScrollbar 组件服务端渲染与结构契约', () => {
  it('渲染包含 no-scrollbar 类和子元素的基本结构', () => {
    const html = renderToString(
      React.createElement(
        FloatingScrollbar,
        { className: 'test-scroll-area' },
        React.createElement('div', { id: 'child-content' }, '测试文本')
      )
    );

    expect(html).toContain('no-scrollbar');
    expect(html).toContain('test-scroll-area');
    expect(html).toContain('测试文本');
    expect(html).toContain('overflow-y-auto');
  });
});
