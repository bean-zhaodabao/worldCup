<template>
  <div class="commission-page">
    <div class="page-header">
      <h2>佣金结算</h2>
      <div>
        <el-button icon="Refresh" :loading="recalcing" @click="doRecalc">重算佣金</el-button>
        <el-button type="primary" @click="openSettlement">创建结算批次</el-button>
      </div>
    </div>

    <el-tabs v-model="tab">
      <el-tab-pane label="佣金明细" name="records">
        <el-row :gutter="16" style="margin-bottom:16px">
          <el-col :span="8"><el-card shadow="hover"><div class="stat"><span>待确认</span><b>¥{{ money(summary.pending) }}</b></div></el-card></el-col>
          <el-col :span="8"><el-card shadow="hover"><div class="stat"><span>可结算</span><b>¥{{ money(summary.available) }}</b></div></el-card></el-col>
          <el-col :span="8"><el-card shadow="hover"><div class="stat"><span>已支付</span><b>¥{{ money(summary.paid) }}</b></div></el-card></el-col>
        </el-row>

        <el-card style="margin-bottom:16px">
          <el-form :inline="true" :model="qf">
            <el-form-item label="代理">
              <el-select v-model="qf.agentId" placeholder="全部" clearable filterable style="width:180px">
                <el-option v-for="a in agentOpts" :key="a._id" :label="a.agentCode + ' / ' + a.username" :value="a._id" />
              </el-select>
            </el-form-item>
            <el-form-item label="状态">
              <el-select v-model="qf.status" placeholder="全部" clearable style="width:110px">
                <el-option label="待确认" value="pending" />
                <el-option label="可结算" value="available" />
                <el-option label="已支付" value="paid" />
                <el-option label="已冲销" value="void" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" icon="Search" @click="loadRecords">搜索</el-button>
              <el-button :disabled="selected.length === 0" type="success" @click="doConfirm">确认入账 ({{ selected.length }})</el-button>
            </el-form-item>
          </el-form>
        </el-card>

        <el-card>
          <el-table :data="records.list" border stripe v-loading="records.loading" @selection-change="onSelect">
            <el-table-column type="selection" width="45" :selectable="(row) => row.status === 'pending'" />
            <el-table-column prop="orderNo" label="订单号" width="175" />
            <el-table-column prop="agentName" label="代理" width="110" />
            <el-table-column prop="userName" label="用户" width="110" />
            <el-table-column label="基数" width="100"><template #default="{row}">¥{{ money(row.baseAmount) }}</template></el-table-column>
            <el-table-column label="比例" width="80"><template #default="{row}">{{ Number(row.rate || 0).toFixed(2) }}%</template></el-table-column>
            <el-table-column label="佣金" width="100"><template #default="{row}">¥{{ money(row.amount) }}</template></el-table-column>
            <el-table-column label="状态" width="100"><template #default="{row}"><el-tag :type="recordTag(row.status)">{{ recordText(row.status) }}</el-tag></template></el-table-column>
            <el-table-column label="时间" width="170"><template #default="{row}">{{ fmt(row.createTime) }}</template></el-table-column>
          </el-table>
          <el-pagination v-model:current-page="records.page" v-model:page-size="records.ps" :total="records.total"
            layout="total,prev,pager,next" style="margin-top:16px;justify-content:flex-end" @change="loadRecords" />
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="结算批次" name="settlements">
        <el-card>
          <el-table :data="settlements.list" border stripe v-loading="settlements.loading">
            <el-table-column prop="agentName" label="代理" width="130" />
            <el-table-column label="金额" width="120"><template #default="{row}">¥{{ money(row.amount) }}</template></el-table-column>
            <el-table-column prop="recordCount" label="记录数" width="90" />
            <el-table-column label="状态" width="100"><template #default="{row}"><el-tag :type="row.status === 'paid' ? 'success' : 'warning'">{{ row.status === 'paid' ? '已支付' : '待打款' }}</el-tag></template></el-table-column>
            <el-table-column label="创建时间" width="170"><template #default="{row}">{{ fmt(row.createTime) }}</template></el-table-column>
            <el-table-column label="支付时间" width="170"><template #default="{row}">{{ fmt(row.paidTime) }}</template></el-table-column>
            <el-table-column label="备注" min-width="140"><template #default="{row}">{{ row.remark }}</template></el-table-column>
            <el-table-column label="操作" width="130">
              <template #default="{row}">
                <el-button v-if="row.status === 'pending'" size="small" type="success" @click="doPay(row)">标记已支付</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-pagination v-model:current-page="settlements.page" v-model:page-size="settlements.ps" :total="settlements.total"
            layout="total,prev,pager,next" style="margin-top:16px;justify-content:flex-end" @change="loadSettlements" />
        </el-card>
      </el-tab-pane>
    </el-tabs>

    <el-dialog title="创建结算批次" v-model="settlementVisible" width="460px">
      <el-form label-width="100px">
        <el-form-item label="代理">
          <el-select v-model="settlementForm.agentId" filterable placeholder="选择代理" style="width:100%">
            <el-option v-for="a in agentOpts" :key="a._id" :label="a.agentCode + ' / ' + a.username" :value="a._id" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="settlementForm.remark" placeholder="可选" /></el-form-item>
        <el-form-item>
          <span class="tip">将把该代理当前所有「可结算」佣金合并为一个批次，线下打款后标记支付。</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="settlementVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="doCreateSettlement">确认创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getAgentList, getCommissionList, confirmCommission, recalcCommission,
  getSettlementList, createSettlement, markSettlementPaid
} from '@/api'

const tab = ref('records')
const saving = ref(false), recalcing = ref(false)
const summary = reactive({ pending: 0, available: 0, paid: 0, void: 0 })
const qf = reactive({ agentId: '', status: '' })
const agentOpts = ref([])

const money = (n) => Number(n || 0).toFixed(2)
const fmt = (t) => t ? new Date(t).toLocaleString('zh-CN') : ''
const recordTag = (s) => ({ pending: 'warning', available: 'success', paid: 'info', void: 'danger' }[s] || 'info')
const recordText = (s) => ({ pending: '待确认', available: '可结算', paid: '已支付', void: '已冲销' }[s] || s)

const records = reactive({ list: [], total: 0, page: 1, ps: 20, loading: false })
const selected = ref([])
const onSelect = (rows) => { selected.value = rows }

const loadRecords = async () => {
  records.loading = true
  try {
    const res = await getCommissionList({ ...qf, page: records.page, pageSize: records.ps })
    records.list = res.data.list || []
    records.total = res.data.total || 0
    Object.assign(summary, res.data.summary || {})
    selected.value = []
  } catch (e) { ElMessage.error(e.message || '加载失败') }
  records.loading = false
}

const doConfirm = async () => {
  if (selected.value.length === 0) return
  try {
    await ElMessageBox.confirm(`确认选中的 ${selected.value.length} 条佣金？确认后可进入结算批次。`, '确认佣金', { type: 'warning' })
    await confirmCommission({ ids: selected.value.map(r => r._id) })
    ElMessage.success('佣金已确认')
    selected.value = []
    loadRecords()
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.message || '操作失败') }
}

const doRecalc = async () => {
  recalcing.value = true
  try {
    const res = await recalcCommission()
    ElMessage.success('重算完成：处理 ' + (res.data.processed || 0) + ' 条，新增 ' + (res.data.created || 0) + ' 条')
    loadRecords()
  } catch (e) { ElMessage.error(e.message || '重算失败') }
  recalcing.value = false
}

const settlements = reactive({ list: [], total: 0, page: 1, ps: 20, loading: false })
const loadSettlements = async () => {
  settlements.loading = true
  try {
    const res = await getSettlementList({ page: settlements.page, pageSize: settlements.ps })
    settlements.list = res.data.list || []
    settlements.total = res.data.total || 0
  } catch (e) { ElMessage.error(e.message || '加载失败') }
  settlements.loading = false
}

const settlementVisible = ref(false)
const settlementForm = reactive({ agentId: '', remark: '' })
const openSettlement = () => {
  settlementForm.agentId = ''
  settlementForm.remark = ''
  settlementVisible.value = true
}
const doCreateSettlement = async () => {
  if (!settlementForm.agentId) return ElMessage.warning('请选择代理')
  saving.value = true
  try {
    const res = await createSettlement({ ...settlementForm })
    settlementVisible.value = false
    ElMessage.success('结算批次已创建：' + (res.data.count || 0) + ' 条，¥' + money(res.data.amount))
    loadRecords()
    loadSettlements()
  } catch (e) { ElMessage.error(e.message || '创建失败') }
  saving.value = false
}

const doPay = async (row) => {
  try {
    await ElMessageBox.confirm(`确认已线下打款 ¥${money(row.amount)} 给 ${row.agentName}？`, '标记已支付', { type: 'warning' })
    await markSettlementPaid(row._id, {})
    ElMessage.success('已标记支付')
    loadSettlements()
    loadRecords()
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.message || '操作失败') }
}

onMounted(async () => {
  try {
    const res = await getAgentList({ pageSize: 100 })
    agentOpts.value = res.data.list || []
  } catch (e) { console.error(e) }
  loadRecords()
  loadSettlements()
})
</script>

<style lang="scss" scoped>
.commission-page .page-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; h2 { margin:0; } }
.stat { display:flex; flex-direction:column; gap:6px; span { color:#909399; font-size:13px; } b { font-size:22px; color:#409EFF; } }
.tip { color:#909399; font-size:12px; }
</style>
