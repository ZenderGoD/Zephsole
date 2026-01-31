import React, { forwardRef, JSX } from 'react';
import { cn } from '@/lib/utils';

// Reusable helper to create components with consistent structure
const createComponent = (
  tag: keyof JSX.IntrinsicElements,
  defaultClassName: string,
  displayName: string
) => {
  const Component = forwardRef<
    HTMLElement,
    React.HTMLAttributes<HTMLElement>
  >((props, ref) => {
    return React.createElement(
      tag,
      { ...props, ref, className: cn(defaultClassName, props.className) },
      props.children
    );
  });
  Component.displayName = displayName;
  return Component;
};

export const H1 = createComponent(
  'h1',
  'scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl',
  'H1'
);

export const H2 = createComponent(
  'h2',
  'scroll-m-20 border-b py-2 text-3xl font-semibold tracking-tight first:mt-0',
  'H2'
);

export const H3 = createComponent(
  'h3',
  'scroll-m-20 text-2xl font-semibold tracking-tight',
  'H3'
);

export const H4 = createComponent(
  'h4',
  'scroll-m-20 text-xl font-semibold tracking-tight',
  'H4'
);

export const Lead = createComponent(
  'p',
  'text-xl text-muted-foreground',
  'Lead'
);

export const P = createComponent(
  'p',
  'leading-7 [&:not(:first-child)]:mt-6',
  'P'
);

export const Large = createComponent(
  'div',
  'text-lg font-semibold',
  'Large'
);

export const Small = createComponent(
  'p',
  'text-sm font-medium leading-none',
  'Small'
);

export const Muted = createComponent(
  'span',
  'text-sm text-muted-foreground',
  'Muted'
);

export const InlineCode = createComponent(
  'code',
  'relative rounded-sm bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold',
  'InlineCode'
);

export const MultilineCode = createComponent(
  'pre',
  'relative rounded-sm bg-muted p-4 font-mono text-sm font-semibold overflow-x-auto',
  'MultilineCode'
);

export const List = createComponent(
  'ul',
  'my-6 ml-6 list-disc [&>li]:mt-2',
  'List'
);

export const Quote = createComponent(
  'blockquote',
  'mt-6 border-l-2 pl-6 italic text-muted-foreground',
  'Quote'
);
