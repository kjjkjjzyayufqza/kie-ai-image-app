# 图片保存、加载和对话滚动

记录 2026-10-04 对 `kie-ai-image-app` 的排查和修复。图片是昨天生成的，远程地址通常还没过期；界面上的「本地副本缺失」和长时间停在读取中，来自本地读取流程，不是 Kie 链接失效。

## 1. 一直提示「本地副本缺失，原始 URL 可能已过期」

成功存进 IndexedDB 的图片，`persistStatus` 是 `stored`，`persistError` 是空的。`useAssetObjectUrl` 只有在 `persistStatus === "pending"` 时才把界面当成加载中。本地字节还在从 IndexedDB 读出来、gzip 解压的这段时间，`src` 是空的，`pending` 也是 false，`StoredImage` 就直接显示 `gallery.persistFailed`。

读完之后如果解压抛错（分片二进制被存成 `Blob` / `Uint8Array` 视图，或分片不完整），失败分支在 `persistStatus === "stored"` 时把 `src` 清掉，远程地址也不会再拿来显示。这句话就会一直留在画面上。

下载走 `downloadStoredAsset` 时，解压抛错会直接变成失败提示，不会退回 Kie 的原始地址。

修复：

- 本地读取未完成时显示「正在读取本地图片…」，不要报副本缺失。
- 本地没有可读字节，或解压失败时，先用仍可用的原始 URL 显示和下载。
- 只有本地和远程都没有可显示的图时，才保留「本地副本缺失」这句话。
- 读取分片时同时接受 `ArrayBuffer`、`Uint8Array` 和 `Blob`。
- 生成当时没写完、状态停在 `pending` / `failed` 的图片，由队列协调器补存到本地。

## 2. 有些图片长时间停在读取中，很慢才画出来

不需要 Rust worker，也不需要 Service Worker。这是浏览器里的 Next.js 应用，图片体积的重活是 gzip 解压。

真正把画面拖住的是两件事叠在一起：

1. `useAssetObjectUrl` 的 effect 依赖整个 `asset` 对象。图库和对话用 Dexie `useLiveQuery`，任意一张图 `markAssetAvailable` 或补存状态一变，房间里所有 asset 都是新对象。effect 清理时把进行中的读取标成取消，再从头读、从头解压。长对话里图片会一张接一张地重来，所以看起来一直在读。
2. 解压原先在主线程上，很多张图一起做时界面画不出来。

修复：

- effect 只依赖 `asset.id` 和内容修订号（状态、分片数、URL），对象引用变化不再取消读取。
- 本地读取最多同时 2 路。同一帧里后挂上的卡片先解码，打开长对话时优先画出底部正在看的图。
- gzip 解压放到一个 Web Worker；Worker 不可用时退回主线程的 `decompressChunks`。

## 3. 打开很长的对话没有滚到底部

`ChatView` 只在 `scrollRequest !== 0` 时滚动，而这个计数只在作曲框提交成功时加一。打开已有房间、切换房间都不会滚。视口高度在任务卡片上是 `aspect-square`，内容一渲染就可以滚到末尾，不需要等图片解码。

修复：

- 进入房间时钉在底部。
- 提交新任务时继续钉在底部。
- 用户向上滚动离开底部约 96px 之后，不再被新内容拽回去。

## 4. 不在这次范围里的事

- 不改 Kie 域名白名单，也不把过期链接伪装成成功。
- 不把解压做成 Rust / WASM。gzip 已经够用，慢来自重复取消和解压占着主线程。
