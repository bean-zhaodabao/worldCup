<template>
  <div class="withdraw-page">
    <div class="page-header"><h2>提现审核</h2></div>

    <el-card style="margin-bottom:16px">
      <el-form :inline="true" :model="qf">
        <el-form-item label="状态">
          <el-select v-model="qf.status" placeholder="全部" clearable style="width:130px">
            <el-option label="待审核" value="pending" /><el-option label="已通过" value="approved" /><el-option label="已驳回" value="rejected" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" icon="Search" @click="loadList">搜索</el-button>
          <el-button icon="Refresh" @click="qf.status='';loadList()">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card>
      <el-table :data="list" border stripe v-loading="loading">
        <el-table-column prop="userName" label="申请用户" width="150" />
        <el-table-column label="金额" width="130">
          <template #default="{row}"><span style="color:#d32f2f;font-weight:bold">¥{{ Number(row.amount).toFixed(2) }}</span></template>
        </el-table-column>
        <el-table-column label="申请时间" width="180">
          <template #default="{row}">{{ fmt(row.applyTime) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{row}">
            <el-tag :type="{pending:'warning',approved:'success',rejected:'info'}[row.status]">
              {{ {pending:'待审核',approved:'已通过',rejected:'已驳回'}[row.status] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="160" />
        <el-table-column label="审核时间" width="180">
          <template #default="{row}">{{ fmt(row.reviewTime) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{row}">
            <template v-if="row.status==='pending'">
              <el-button size="small" type="success" @click="doReview(row,true)">通过</el-button>
              <el-button size="small" type="danger" @click="doReview(row,false)">驳回</el-button>
            </template>
            <span v-else>-</span>
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
import { getWithdrawList, reviewWithdraw } from '@/api'

const loading = ref(false)
const list = ref([]), page = ref(1), ps = ref(20), total = ref(0)
const qf = reactive({ status: '' })

const loadList = async () => {
  loading.value = true
  try {
    const res = await getWithdrawList({ ...qf, page: page.value, pageSize: ps.value })
    list.value = res.data.list || []
    total.value = res.data.total || 0
  } catch (e) { console.error(e) }
  loading.value = false
}
loadList()

const doReview = async (row, approve) => {
  try {
    const { value: remark } = await ElMessageBox.prompt(
      approve ? '确认通过提现 ¥' + Number(row.amount).toFixed(2) + '？通过后冻结金额将扣减，请线下打款。' : '确认驳回提现 ¥' + Number(row.amount).toFixed(2) + '？驳回后金额解冻回用户余额。',
      approve ? '提现通过' : '提现驳回',
      {
        inputPlaceholder: '备注(可选)',
        inputValue: '',
        type: approve ? 'warning' : 'error'
      }
    ).catch(() => null)
    if (remark === null && remark === undefined) return
    await reviewWithdraw(row._id, approve, remark || '')
    ElMessage.success(approve ? '已通过' : '已驳回')
    loadList()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message || '操作失败')
  }
}

const fmt = (t) => t ? new Date(t).toLocaleString('zh-CN') : ''
</script>

<style lang="scss" scoped>
.withdraw-page .page-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; h2 { margin:0; } }
</style>
