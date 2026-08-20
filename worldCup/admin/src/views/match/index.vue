<template>
  <div class="match-page">
    <div class="page-header">
      <h2>赛事管理</h2>
      <div>
        <el-button type="success" icon="Refresh" :loading="syncing" @click="doSync">立即同步</el-button>
        <el-button type="primary" :disabled="!selectedIds.length" @click="batchOnline(true)">批量上架</el-button>
        <el-button type="danger" :disabled="!selectedIds.length" @click="batchOnline(false)">批量下架</el-button>
      </div>
    </div>

    <el-card style="margin-bottom:16px">
      <el-form :inline="true" :model="qf">
        <el-form-item label="名称"><el-input v-model="qf.name" placeholder="队名/联赛搜索" clearable style="width:180px" /></el-form-item>
        <el-form-item label="状态">
          <el-select v-model="qf.status" placeholder="全部" clearable style="width:130px">
            <el-option label="未开始" value="upcoming" /><el-option label="进行中" value="live" />
            <el-option label="已结束" value="finished" /><el-option label="已结算" value="settled" />
            <el-option label="已取消" value="cancelled" />
          </el-select>
        </el-form-item>
        <el-form-item label="上架">
          <el-select v-model="qf.online" placeholder="全部" clearable style="width:110px">
            <el-option label="已上架" :value="true" /><el-option label="已下架" :value="false" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" icon="Search" @click="loadList">搜索</el-button>
          <el-button icon="Refresh" @click="qf.name='';qf.status='';qf.online='';loadList()">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card>
      <el-table :data="list" border stripe v-loading="loading" @selection-change="onSelectionChange">
        <el-table-column type="selection" width="45" />
        <el-table-column label="场次号" width="90">
          <template #default="{row}"><el-tag size="small">{{ row.ccId || '-' }}</el-tag></template>
        </el-table-column>
        <el-table-column label="联赛" width="110">
          <template #default="{row}">{{ row.leagueName || '-' }}</template>
        </el-table-column>
        <el-table-column label="对阵" min-width="180">
          <template #default="{row}">
            <span>{{ row.teamA }}</span>
            <span style="color:#d32f2f;margin:0 6px">vs</span>
            <span>{{ row.teamB }}</span>
          </template>
        </el-table-column>
        <el-table-column label="比分" width="90">
          <template #default="{row}">
            <span v-if="row.status==='finished'||row.status==='settled'||row.status==='live'">{{ row.homeScore ?? '-' }} : {{ row.guestScore ?? '-' }}</span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="开始时间" width="150">
          <template #default="{row}">{{ fmt(row.startTime) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{row}"><el-tag :type="tagType(row.status)">{{ statusText(row.status) }}</el-tag></template>
        </el-table-column>
        <el-table-column label="上架" width="90">
          <template #default="{row}">
            <el-switch :model-value="row.online !== false" @change="(v)=>toggleOnline(row,v)" />
          </template>
        </el-table-column>
        <el-table-column label="数据更新时间" width="150">
          <template #default="{row}">{{ fmt(row.syncedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{row}">
            <el-button size="small" @click="$router.push('/match/'+row._id+'/plays')">玩法</el-button>
            <el-button size="small" type="warning" v-if="['upcoming','live','finished'].includes(row.status) && row.sourceMatchId" @click="advanceStatus(row)">手动推进</el-button>
            <el-popconfirm title="确定删除？已有订单的赛事将下架处理" @confirm="doDelete(row)">
              <template #reference><el-button size="small" type="danger">删除</el-button></template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination v-model:current-page="page" v-model:page-size="ps" :total="total" layout="total,prev,pager,next" style="margin-top:16px;justify-content:flex-end" @change="loadList" />
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getMatchList, deleteMatch, updateMatchStatus, syncMatches, updateMatchOnline, batchOnlineMatches } from '@/api'

const loading = ref(false), syncing = ref(false)
const list = ref([]), page = ref(1), ps = ref(20), total = ref(0)
const selectedIds = ref([])
const qf = reactive({ name: '', status: '', online: '' })

const onSelectionChange = (rows) => { selectedIds.value = rows.map(r => r._id) }

const loadList = async () => {
  loading.value = true
  try {
    const res = await getMatchList({ ...qf, page: page.value, pageSize: ps.value })
    list.value = res.data.list || []; total.value = res.data.total || 0
  } catch (e) { console.error(e) }
  loading.value = false
}
loadList()

const doSync = async () => {
  syncing.value = true
  try {
    const res = await syncMatches()
    const st = res.data || {}
    let msg = res.message || '同步完成'
    if (st.matchesAdded !== undefined) {
      msg = `同步完成: 赛事新增${st.matchesAdded}/更新${st.matchesUpdated}，玩法新增${st.playsAdded}/更新${st.playsUpdated}，结算订单${st.settledOrders || 0}，退款${st.refunded || 0}`
    }
    if (st.errors && st.errors.length) {
      ElMessage.warning(msg + '；错误' + st.errors.length + '条：' + st.errors.slice(0, 3).join('；'))
    } else {
      ElMessage.success(msg)
    }
    loadList()
  } catch (e) { ElMessage.error(e.message || '同步失败') }
  syncing.value = false
}

const toggleOnline = async (row, v) => {
  try {
    await updateMatchOnline(row._id, v)
    row.online = v
    ElMessage.success(v ? '已上架' : '已下架')
  } catch (e) { ElMessage.error(e.message || '操作失败') }
}

const batchOnline = async (online) => {
  try {
    await ElMessageBox.confirm('确认' + (online ? '上架' : '下架') + '选中的 ' + selectedIds.value.length + ' 场赛事?', '批量操作', { type: 'warning' })
    await batchOnlineMatches(selectedIds.value, online)
    ElMessage.success('已' + (online ? '上架' : '下架'))
    loadList()
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.message || '操作失败') }
}

const doDelete = async (row) => {
  try { await deleteMatch(row._id); ElMessage.success('已删除'); loadList() }
  catch (e) { ElMessage.error(e.message || '删除失败') }
}

const statusFlow = { upcoming: 'live', live: 'finished', finished: 'settled' }
const advanceStatus = async (row) => {
  const next = statusFlow[row.status]
  if (!next) return
  try {
    await ElMessageBox.confirm('手动将状态从"' + statusText(row.status) + '"变更为"' + statusText(next) + '"?（接口状态自动同步，此操作用于异常修正）', '状态变更', { type: 'warning' })
    await updateMatchStatus(row._id, next)
    ElMessage.success('状态已更新')
    loadList()
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.message || '操作失败') }
}

const statusText = (s) => ({ upcoming: '未开始', live: '进行中', finished: '已结束', settled: '已结算', cancelled: '已取消' }[s])
const tagType = (s) => ({ upcoming: 'info', live: 'success', finished: 'warning', settled: 'info', cancelled: 'danger' }[s])
const fmt = (t) => t ? new Date(t).toLocaleString('zh-CN') : ''
</script>

<style lang="scss" scoped>
.match-page .page-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; h2 { margin:0; } }
</style>
