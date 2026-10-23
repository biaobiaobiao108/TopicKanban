# 外部只读 API

外部服务通过版本化 API 读取看板数据。当前提供活跃选题列表，响应使用精简字段，避免依赖前端内部的完整选题模型。

## 活跃选题

```http
GET /api/v1/topics?limit=5
X-Quick-Drop-Token: <QUICK_DROP_TOKEN>
```

- `limit`：返回条数，默认 `5`，范围 `1` 到 `100`。
- 只返回未删除且状态为 `inbox`、`scripting` 或 `production` 的选题。
- 按 `updated_at` 倒序；更新时间相同时按 `id` 升序，保证结果顺序稳定。
- 只读响应字段：`id`、`title`、`status`、`priority`、`updated_at`。

响应示例：

```json
{
  "items": [
    {
      "id": "topic-id",
      "title": "选题标题",
      "status": "scripting",
      "priority": "high",
      "updated_at": "2026-10-24T08:00:00.000Z"
    }
  ]
}
```

接口只接受 `X-Quick-Drop-Token`，不会因此开放其他看板 API。该凭据同时可以调用现有快投写入接口，部署时应将其作为密钥保管。

## Glance 配置示例

将 `QUICK_DROP_TOKEN` 以环境变量提供给 Glance，并把小组件放进右侧的小列。替换看板服务地址：

```yaml
- size: small
  widgets:
    - type: custom-api
      title: 最新活跃选题
      cache: 5m
      url: https://kanban.example.com/api/v1/topics
      headers:
        X-Quick-Drop-Token: ${QUICK_DROP_TOKEN}
      parameters:
        limit: 5
      template: |
        <ul class="list list-gap-10">
          {{ range .JSON.Array "items" }}
          <li>
            <a class="size-h4 color-primary-if-not-visited block text-truncate" href="https://kanban.example.com/topics/{{ .String "id" }}">{{ .String "title" }}</a>
            <p class="size-h6 color-subdue">{{ .String "status" }} · {{ .String "priority" }}</p>
          </li>
          {{ end }}
        </ul>
```
