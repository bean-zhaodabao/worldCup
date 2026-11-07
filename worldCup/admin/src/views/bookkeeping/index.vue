<template>
  <div class="bookkeeping-page">
    <div class="page-header">
      <h2>对冲记账</h2>
      <el-button type="primary" icon="Plus" @click="openCreate">新增记账</el-button>
    </div>

    <!-- 筛选 -->
    <el-card style="margin-bottom:16px">
      <el-form :inline="true" :model="qf">
        <el-form-item label="记账日期">
          <el-date-picker
            v-model="qf.dateRange"
            type="daterange"
            value-format="YYYY-MM-DD"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            style="width:240px"
          />
        </el-form-item>
        <el-form-item label="关键词">
          <el-input
            v-model="qf.keyword"
            placeholder="单号 / 平台 / 备注"
            clearable
            style="width:180px"
            @keyup.enter="search"
          />
        </el-form-item>
        <el-form-item label="平台">
          <el-input v-model="qf.platform" placeholder="平台名称" clearable style="width:140px" @keyup.enter="search" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" icon="Search" @click="search">搜索</el-button>
          <el-button icon="Refresh" @click="resetQuery">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 汇总 -->
    <el-row :gutter="12" class="summary-row">
      <el-col :span="4" v-for="item in summaryCards" :key="item.key">
        <el-card shadow="hover">
          <div class="stat-card">
            <span class="stat-label">{{ item.label }}</span>
            <b class="stat-value" :class="item.profit ? profitClass(item.value) : ''">¥{{ money(item.value) }}</b>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 列表 -->
    <el-card>
      <el-table :data="list" border stripe v-loading="loading">
        <el-table-column label="记账日期" width="110">
          <template #default="{ row }">{{ fmtDay(row.recordDate) }}</template>
        </el-table-column>
        <el-table-column prop="title" label="单号/摘要" min-width="130" show-overflow-tooltip />
        <el-table-column prop="platform" label="对冲平台" width="120" show-overflow-tooltip />
        <el-table-column label="下注金额" width="110" align="right">
          <template #default="{ row }">{{ money(row.betAmount) }}</template>
        </el-table-column>
        <el-table-column label="对冲金额" width="110" align="right">
          <template #default="{ row }">{{ money(row.hedgeAmount) }}</template>
        </el-table-column>
        <el-table-column label="未对冲金额" width="115" align="right">
          <template #default="{ row }">{{ money(unhedgedAmountOf(row)) }}</template>
        </el-table-column>
        <el-table-column label="未对冲盈亏" width="115" align="right">
          <template #default="{ row }">
            <span :class="profitClass(row.unhedgedProfit)">{{ money(row.unhedgedProfit) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="对冲返现" width="110" align="right">
          <template #default="{ row }">{{ money(row.hedgeRebate) }}</template>
        </el-table-column>
        <el-table-column label="对冲盈亏" width="115" align="right">
          <template #default="{ row }">
            <span :class="profitClass(hedgeProfitOf(row))">{{ money(hedgeProfitOf(row)) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="总盈亏" width="115" align="right">
          <template #default="{ row }">
            <b :class="profitClass(totalProfitOf(row))">{{ money(totalProfitOf(row)) }}</b>
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="140" show-overflow-tooltip />
        <el-table-column prop="operatorName" label="操作人" width="100" />
        <el-table-column label="创建时间" width="160">
          <template #default="{ row }">{{ fmtTime(row.createTime) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="130" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openEdit(row)">编辑</el-button>
            <el-popconfirm title="确定删除该条记账？" @confirm="doDelete(row)">
              <template #reference>
                <el-button size="small" type="danger">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="ps"
        :total="total"
        layout="total,prev,pager,next"
        style="margin-top:16px;justify-content:flex-end"
        @change="loadList"
      />
    </el-card>

    <!-- 新增/编辑 -->
    <el-dialog
      v-model="dialogVisible"
      :title="form._id ? '编辑记账' : '新增记账'"
      width="580px"
      :close-on-click-modal="false"
      @closed="resetForm"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="记账日期" prop="recordDate">
          <el-date-picker v-model="form.recordDate" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item label="单号/摘要">
          <el-input v-model="form.title" maxlength="100" placeholder="可选" />
        </el-form-item>
        <el-form-item label="对冲平台">
          <el-input v-model="form.platform" maxlength="50" placeholder="可选" />
        </el-form-item>

        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="下注金额" prop="betAmount">
              <el-input-number v-model="form.betAmount" :min="0" :precision="2" :controls="false" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="对冲金额" prop="hedgeAmount">
              <el-input-number v-model="form.hedgeAmount" :min="0" :precision="2" :controls="false" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="未对冲金额">
          <el-input :model-value="money(computedUnhedged)" disabled />
          <div v-if="overHedged" class="tip-warn">对冲金额大于下注金额（超额对冲）</div>
        </el-form-item>

        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="未对冲盈亏">
              <el-input-number v-model="form.unhedgedProfit" :precision="2" :controls="false" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="对冲返现">
              <el-input-number v-model="form.hedgeRebate" :precision="2" :controls="false" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="对冲盈亏">
          <span class="hedge-profit" :class="profitClass(computedHedgeProfit)">¥{{ money(computedHedgeProfit) }}</span>
          <span class="formula-tip">对冲返现 - 对冲金额</span>
        </el-form-item>

        <el-form-item label="总盈亏">
          <span class="total-profit" :class="profitClass(computedTotal)">¥{{ money(computedTotal) }}</span>
          <span class="formula-tip">下注金额 - 对冲金额 + 未对冲盈亏 + 对冲返现</span>
        </el-form-item>

        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" maxlength="200" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, nextTick, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import {
  getHedgeRecordList,
  getHedgeRecordSummary,
  createHedgeRecord,
  updateHedgeRecord,
  deleteHedgeRecord
} from '@/api'

const loading = ref(false)
const saving = ref(false)
const list = ref([])
const page = ref(1)
const ps = ref(20)
const total = ref(0)
const dialogVisible = ref(false)
const formRef = ref(null)

const qf = reactive({ dateRange: [], keyword: '', platform: '' })

const summary = reactive({
  betTotal: 0,
  hedgeTotal: 0,
  unhedgedTotal: 0,
  unhedgedProfitTotal: 0,
  rebateTotal: 0,
  totalProfit: 0
})

const summaryCards = computed(() => [
  { key: 'betTotal', label: '下注合计', value: summary.betTotal },
  { key: 'hedgeTotal', label: '对冲合计', value: summary.hedgeTotal },
  { key: 'unhedgedTotal', label: '未对冲合计', value: summary.unhedgedTotal },
  { key: 'unhedgedProfitTotal', label: '未对冲盈亏', value: summary.unhedgedProfitTotal, profit: true },
  { key: 'rebateTotal', label: '对冲返现', value: summary.rebateTotal },
  { key: 'totalProfit', label: '总盈亏', value: summary.totalProfit, profit: true }
])

const todayStr = () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const defaultForm = () => ({
  _id: '',
  recordDate: todayStr(),
  title: '',
  platform: '',
  betAmount: 0,
  hedgeAmount: 0,
  unhedgedProfit: 0,
  hedgeRebate: 0,
  remark: ''
})

const form = reactive(defaultForm())

const rules = {
  recordDate: [{ required: true, message: '请选择记账日期', trigger: 'change' }],
  betAmount: [{ required: true, message: '请输入下注金额', trigger: 'blur' }],
  hedgeAmount: [{ required: true, message: '请输入对冲金额', trigger: 'blur' }]
}

const computedUnhedged = computed(() => {
  const n = round2(Number(form.betAmount || 0) - Number(form.hedgeAmount || 0))
  return n > 0 ? n : 0
})
const computedHedgeProfit = computed(() =>
  round2(Number(form.hedgeRebate || 0) - Number(form.hedgeAmount || 0))
)
const computedTotal = computed(() =>
  round2(
    Number(form.betAmount || 0) -
      Number(form.hedgeAmount || 0) +
      Number(form.unhedgedProfit || 0) +
      Number(form.hedgeRebate || 0)
  )
)
const overHedged = computed(() => Number(form.hedgeAmount || 0) > Number(form.betAmount || 0))

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100
const money = (v) => Number(v || 0).toFixed(2)

const unhedgedAmountOf = (row) => {
  const hasStored = row.unhedgedAmount !== undefined && row.unhedgedAmount !== null && row.unhedgedAmount !== ''
  const raw = hasStored
    ? Number(row.unhedgedAmount)
    : Number(row.betAmount || 0) - Number(row.hedgeAmount || 0)
  const n = round2(raw)
  return n > 0 ? n : 0
}
const hedgeProfitOf = (row) => round2(Number(row.hedgeRebate || 0) - Number(row.hedgeAmount || 0))
const totalProfitOf = (row) =>
  round2(
    Number(row.betAmount || 0) -
      Number(row.hedgeAmount || 0) +
      Number(row.unhedgedProfit || 0) +
      Number(row.hedgeRebate || 0)
  )

const profitClass = (v) => {
  const n = Number(v || 0)
  if (n > 0) return 'profit-positive'
  if (n < 0) return 'profit-negative'
  return 'profit-zero'
}

const fmtDay = (t) => {
  if (!t) return ''
  const d = new Date(t)
  if (isNaN(d.getTime())) return ''
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const fmtTime = (t) => (t ? new Date(t).toLocaleString('zh-CN') : '')

const buildParams = () => {
  const params = { keyword: qf.keyword || '', platform: qf.platform || '' }
  if (Array.isArray(qf.dateRange) && qf.dateRange.length === 2) {
    params.startDate = qf.dateRange[0]
    params.endDate = qf.dateRange[1]
  }
  return params
}

const loadList = async () => {
  loading.value = true
  try {
    const res = await getHedgeRecordList({ ...buildParams(), page: page.value, pageSize: ps.value })
    list.value = res.data.list || []
    total.value = res.data.total || 0
    loadSummary()
  } catch (e) {
    ElMessage.error(e.message || '加载失败')
  }
  loading.value = false
}

const loadSummary = async () => {
  try {
    const res = await getHedgeRecordSummary(buildParams())
    Object.assign(summary, res.data || {})
  } catch (e) {
    console.error(e)
  }
}

const search = () => {
  page.value = 1
  loadList()
}

const resetQuery = () => {
  qf.dateRange = []
  qf.keyword = ''
  qf.platform = ''
  search()
}

const resetForm = () => {
  Object.assign(form, defaultForm())
  formRef.value?.clearValidate()
}

const openCreate = () => {
  Object.assign(form, defaultForm())
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

const openEdit = (row) => {
  Object.assign(form, {
    _id: row._id,
    recordDate: fmtDay(row.recordDate),
    title: row.title || '',
    platform: row.platform || '',
    betAmount: Number(row.betAmount || 0),
    hedgeAmount: Number(row.hedgeAmount || 0),
    unhedgedProfit: Number(row.unhedgedProfit || 0),
    hedgeRebate: Number(row.hedgeRebate || 0),
    remark: row.remark || ''
  })
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

const submit = async () => {
  try {
    await formRef.value.validate()
  } catch (e) {
    return
  }

  saving.value = true
  try {
    const payload = {
      recordDate: form.recordDate,
      title: form.title,
      platform: form.platform,
      betAmount: Number(form.betAmount || 0),
      hedgeAmount: Number(form.hedgeAmount || 0),
      unhedgedProfit: Number(form.unhedgedProfit || 0),
      hedgeRebate: Number(form.hedgeRebate || 0),
      remark: form.remark
    }
    if (form._id) {
      await updateHedgeRecord(form._id, payload)
      ElMessage.success('已保存')
    } else {
      await createHedgeRecord(payload)
      ElMessage.success('记账成功')
    }
    dialogVisible.value = false
    loadList()
  } catch (e) {
    ElMessage.error(e.message || '保存失败')
  }
  saving.value = false
}

const doDelete = async (row) => {
  try {
    await deleteHedgeRecord(row._id)
    ElMessage.success('已删除')
    if (list.value.length === 1 && page.value > 1) page.value--
    loadList()
  } catch (e) {
    ElMessage.error(e.message || '删除失败')
  }
}

onMounted(loadList)
</script>

<style lang="scss" scoped>
.bookkeeping-page {
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    h2 { margin: 0; }
  }

  .summary-row {
    margin-bottom: 16px;

    .stat-card {
      display: flex;
      flex-direction: column;
      gap: 6px;

      .stat-label {
        font-size: 13px;
        color: #909399;
      }

      .stat-value {
        font-size: 20px;
        font-weight: 600;
      }
    }
  }

  .profit-positive { color: #2e7d32; }
  .profit-negative { color: #d32f2f; }
  .profit-zero { color: #606266; }

  .total-profit {
    font-size: 18px;
    font-weight: 600;
  }

  .hedge-profit {
    font-size: 16px;
    font-weight: 600;
  }

  .formula-tip {
    margin-left: 10px;
    font-size: 12px;
    color: #909399;
  }

  .tip-warn {
    margin-top: 4px;
    font-size: 12px;
    color: #e6a23c;
    line-height: 1.4;
  }
}
</style>
