#!/usr/bin/perl
use strict; use warnings;
binmode(STDIN, ':utf8'); binmode(STDOUT, ':utf8');
local $/; my $s = <STDIN>;

# 1) 移除所有 dark: 前缀的原始调色板类（含 dark:hover: 等组合）
$s =~ s/[ ]?(?:[a-z]+:)*dark:(?:[a-z]+:)*(?:bg|text|border|ring|divide|placeholder|decoration|from|via|to|shadow|outline|fill|stroke|accent)-(?:stone|red|rose|amber|orange|emerald|green|teal|lime|cyan|sky|blue|indigo|violet|purple|fuchsia|slate|gray|zinc|neutral|white|black)(?:-[a-z0-9]+)?(?:\/[\w.\[\]\/-]+)?//g;

# 2) text-stone 层级 → 语义墨色
$s =~ s/\btext-stone-(?:950|900|800|700)\b/text-ink/g;
$s =~ s/\btext-stone-(?:600|500|400)\b/text-ink-muted/g;
$s =~ s/\btext-stone-(?:300|200|100)\b/text-ink-faint/g;
$s =~ s/\bplaceholder:text-stone-\d+\b/placeholder:text-ink-faint/g;

# 3) bg-stone tint（完整吞掉透明度后缀）
$s =~ s/\bbg-stone-(?:500|400|100)\/\[0\.0\d+\]/bg-control/g;
$s =~ s/\bbg-stone-(?:500|100|200)\/(?:\d+)\b/bg-control/g;
$s =~ s/\bbg-stone-(?:800|700)\/(?:\d+)\b/bg-control-hover/g;
$s =~ s/\bbg-stone-500\b/bg-control/g;
$s =~ s/\bbg-stone-400\b/bg-ink-faint/g;
$s =~ s/\bbg-stone-100\b/bg-control/g;
$s =~ s/\bbg-stone-200\b/bg-surface-subtle/g;
$s =~ s/\bbg-stone-50(?:\/\d+)?\b/bg-canvas/g;

# 4) bg-white / bg-black
$s =~ s/\bbg-white\/\d+\b/bg-surface-muted/g;
$s =~ s/\bbg-white\b/bg-surface/g;
$s =~ s/\bbg-black\/\d+\b/bg-overlay/g;

# 5) border / divide / ring stone → line
$s =~ s/\bborder-stone-\d+(?:\/[\w.\[\]-]+)?\b/border-line/g;
$s =~ s/\bdivide-stone-\d+(?:\/[\w.\[\]-]+)?\b/divide-line/g;
$s =~ s/\bring-stone-\d+(?:\/\d+)?\b/ring-line/g;

# 6) 彩色语义族：shade>=400 无斜杠=实色(→前景色)，带斜杠或浅 shade=柔和底
my %fam = (
  red=>'danger', rose=>'danger',
  amber=>'warning', orange=>'warning',
  emerald=>'success', green=>'success', teal=>'success', lime=>'success',
  blue=>'info', sky=>'info', cyan=>'info', indigo=>'info',
  purple=>'stage-production', violet=>'stage-production', fuchsia=>'stage-production',
);
my %softbg = (danger=>'danger-soft', warning=>'warning-soft', success=>'success-soft', info=>'info-soft', 'stage-production'=>'stage-production-soft');
for my $c (keys %fam) {
  my $f = $fam{$c};
  my $soft = $softbg{$f};
  $s =~ s/\btext-$c-\d+\b/text-$f/g;
  $s =~ s/\bbg-$c-(\d+)(\/[\w.\[\]-]+)?\b/ ($2 || $1 <= 200) ? "bg-$soft" : "bg-$f" /ge;
  $s =~ s/\bborder-$c-(\d+)(\/[\w.\[\]-]+)?\b/ ($f eq 'danger') ? "border-danger-line" : "border-$soft" /ge;
  $s =~ s/\bring-$c-(\d+)(\/\d+)?\b/ring-$f/g;
}

# 7) var() 任意值颜色 → 语义别名（仅在颜色词干后出现时替换）
my %varmap = (
  'ink'=>'ink', 'ink-muted'=>'ink-muted', 'ink-faint'=>'ink-faint',
  'canvas'=>'canvas', 'surface'=>'surface', 'surface-muted'=>'surface-muted', 'surface-subtle'=>'surface-subtle', 'surface-hover'=>'surface-hover',
  'accent'=>'accent', 'accent-soft'=>'accent-soft', 'accent-dark'=>'accent-dark',
  'h1-color'=>'h1-color', 'line'=>'line', 'line-soft'=>'line-soft',
  'danger-fg'=>'danger', 'danger-soft'=>'danger-soft', 'danger-line'=>'danger-line',
  'warning-fg'=>'warning', 'warning-soft'=>'warning-soft',
  'success-fg'=>'success', 'success-soft'=>'success-soft',
  'info-fg'=>'info', 'info-soft'=>'info-soft',
  'stage-inbox'=>'stage-inbox', 'stage-inbox-soft'=>'stage-inbox-soft',
  'stage-scripting'=>'stage-scripting', 'stage-scripting-soft'=>'stage-scripting-soft',
  'stage-production'=>'stage-production', 'stage-production-soft'=>'stage-production-soft',
  'stage-published'=>'stage-published', 'stage-published-soft'=>'stage-published-soft',
  'stage-icebox'=>'stage-icebox', 'stage-icebox-soft'=>'stage-icebox-soft',
  'control-surface'=>'control', 'control-surface-hover'=>'control-hover',
);
my $stems = 'text|bg|border|ring|divide|outline|from|to|via|fill|stroke|decoration|shadow';
for my $v (sort { length($b) <=> length($a) } keys %varmap) {
  my $alias = $varmap{$v};
  s/(\b(?:[a-z-]+:)*(?:$stems)-)\[var\(--\Q$v\E\)\]/$1$alias/g for ($s);
}
# 带透明度后缀的 line 变体
$s =~ s/(\b(?:[a-z-]+:)*border)-\[var\(--line(?:-soft)?\)\]\/\d+/$1-line/g for ($s);
$s =~ s/(\b(?:[a-z-]+:)*divide)-\[var\(--line(?:-soft)?\)\]\/\d+/$1-line/g for ($s);

# rounded-[var(--radius-*)] → 三档尺度
$s =~ s/\brounded-\[var\(--radius-sm\)\]/rounded-sm/g;
$s =~ s/\brounded-\[var\(--radius-md\)\]/rounded-lg/g;
$s =~ s/\brounded-\[var\(--radius-lg\)\]/rounded-2xl/g;

print $s;
