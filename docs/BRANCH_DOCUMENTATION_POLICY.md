# Политика документации веток Nexora

## 1. Назначение

Документ определяет, как поддерживается документация во всех ветках репозитория `Onmaynec/Nexora`.

Цель политики — исключить ситуацию, при которой историческая, экспериментальная или уже объединённая ветка выглядит как текущий продуктовый релиз.

## 2. Единственный текущий источник истины

`main` является единственным authoritative source of truth для:

- текущей версии продукта;
- поддерживаемых API и schema;
- продуктовой архитектуры;
- Security Policy и threat model;
- deployment и operations guidance;
- release classification;
- пользовательской и административной документации.

На момент принятия политики текущая линия `main`:

| Параметр | Значение |
|---|---|
| Версия | `3.2.4` |
| Распространение | Source/PWA prerelease |
| Signed production baseline | `3.1.2` |
| Application API | v3 |
| Trust/MLS/encrypted-media API | v4 |
| Local Server database | SQLite schema 8 |

## 3. Классы веток

### 3.1 Current

Только `main`. Общие документы обязаны соответствовать текущему коду и release evidence.

### 3.2 Active development

Ветка с незавершённой работой должна иметь `BRANCH_STATUS.md`, в котором указаны:

- точное имя ветки;
- целевая версия;
- base release;
- реализованный scope;
- отсутствующие функции и release blockers;
- совместимость API/schema;
- запрет неподтверждённых security- и release-claims.

### 3.3 Merged provenance

Ветка, объединённая через Pull Request, сохраняется только для истории разработки. Её документы описывают состояние branch head на момент merge и не обновляются так, чтобы имитировать `main`.

### 3.4 Superseded

Промежуточная ветка, заменённая final branch или более новой реализацией. Она не используется для новых изменений, тегов или релизов.

### 3.5 Obsolete automation

Ветка одноразовой автоматизации или materialization, утратившая назначение. Она не должна merge/tag/publish. После сохранения требуемого provenance ветку следует закрыть или удалить.

## 4. Обязательный branch status

Каждая сохраняемая non-main ветка должна иметь branch-local `BRANCH_STATUS.md` с явным предупреждением:

1. это не текущая версия продукта;
2. текущая документация находится в `main`;
3. branch-local release claims относятся только к содержимому данной ветки;
4. merged/superseded/obsolete branch нельзя использовать как release source;
5. исторические документы не подтверждают поддержку или безопасность текущего deployment.

## 5. Что разрешено менять в исторической ветке

Разрешено:

- исправить статус и назначение ветки;
- добавить ссылки на current `main` documentation;
- исправить опасную инструкцию, если она может привести к потере данных или раскрытию secret;
- отметить документ как historical, superseded или draft;
- исправить неработающую ссылку без изменения release provenance.

Не разрешено:

- менять branch-local version на текущую версию `main`;
- переносить current feature claims в старую ветку;
- объявлять старую ветку stable, supported или audited;
- переписывать release notes и verification evidence задним числом;
- изменять runtime code под видом документационного обновления.

## 6. Документационный gate

Перед merge документационного изменения проверяются:

- соответствие фактическому branch/release state;
- отсутствие изменений source code, package metadata, migrations, dependencies и workflows, если задача documentation-only;
- корректность repository-relative links;
- отсутствие secrets, private keys, databases, backups и пользовательских данных;
- согласованность README, Documentation Portal, Security Policy, Branch Index и Release Status;
- успешное выполнение существующего CI на `main`.

## 7. Центральный индекс

Полный lifecycle веток фиксируется в [`BRANCHES.md`](../BRANCHES.md). Фактические Pull Request states, Git refs, tags и branch protection в GitHub имеют приоритет над текстовым индексом при операционных действиях.
