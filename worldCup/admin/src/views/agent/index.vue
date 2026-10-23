<template>
  <div class="agent-page">
    <div class="page-header">
      <h2>代理商管理</h2>
      <el-button type="primary" @click="openCreate">创建代理</el-button>
    </div>

    <el-card style="margin-bottom:16px">
      <el-form :inline="true" :model="qf">
        <el-form-item label="关键词">
          <el-input v-model="qf.keyword" placeholder="用户名/代理编号" clearable style="width:180px" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="qf.status" placeholder="全部" clearable style="width:120px">
            <el-option label="正常" value="active" />
            <el-option label="禁用" value="disabled" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" icon="Search" @click="loadList">搜索</el-button>
          <el-button icon="Refresh" @click="resetQuery">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card>
      <el-table :data="list" border stripe v-loading="loading">
        <el-table-column prop="agentCode" label="代理编号" width="110" />
        <el-table-column prop="username" label="用户名" width="140" />
        <el-table-column label="佣金比例" width="100">
          <template #default="{row}">{{ Number(row.commissionRate || 0).toFixed(2) }}%</template>
        </el-table-column>
        <el-table-column prop="userCount" label="用户数" width="80" />
        <el-table-column label="累计流水" width="120">
          <template #default="{row}">¥{{ Number(row.totalBet || 0).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="累计中奖" width="120">
          <template #default="{row}">¥{{ Number(row.totalWin || 0).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="盈亏" width="120">
          <template #default="{row}">
            <span :class="Number(row.profit||0) >= 0 ? 'profit' : 'loss'">¥{{ Number(row.profit || 0).toFixed(2) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="累计佣金" width="120">
          <template #default="{row}">¥{{ Number(row.commissionTotal || 0).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{row}">
            <el-tag :type="row.status === 'active' ? 'success' : 'danger'">{{ row.status === 'active' ? '正常' : '禁用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="170">
          <template #default="{row}">{{ fmt(row.createTime) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="300" fixed="right">
          <template #default="{row}">
            <el-button size="small" @click="goDetail(row)">详情</el-button>
            <el-button size="small" @click="openEdit(row)">编辑</el-button>
            <el-button size="small" @click="openReset(row)">重置密码</el-button>
            <el-button size="small" :type="row.status === 'active' ? 'warning' : 'success'" @click="toggleStatus(row)">
              {{ row.status === 'active' ? '禁用' : '启用' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination v-model:current-page="page" v-model:page-size="ps" :total="total"
        layout="total,prev,pager,next" style="margin-top:16px;justify-content:flex-end" @change="loadList" />
    </el-card>

    <el-dialog title="创建代理" v-model="createVisible" width="460px">
      <el-form :model="createForm" label-width="100px">
        <el-form-item label="用户名"><el-input v-model="createForm.username" placeholder="至少3个字符" /></el-form-item>
        <el-form-item label="密码"><el-input v-model="createForm.password" type="password" show-password placeholder="至少6个字符" /></el-form-item>
        <el-form-item label="佣金比例">
          <el-input-number v-model="createForm.commissionRate" :min="0" :max="100" :precision="2" :step="0.5" style="width:180px" />
          <span class="tip">按流水返佣，2.5 表示 2.5%</span>
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="createForm.remark" placeholder="可选" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="doCreate">确认创建</el-button>
      </template>
    </el-dialog>

    <el-dialog title="编辑代理" v-model="editVisible" width="460px">
      <el-form :model="editForm" label-width="100px">
        <el-form-item label="用户名"><el-input :value="editForm.username" disabled /></el-form-item>
        <el-form-item label="佣金比例">
          <el-input-number v-model="editForm.commissionRate" :min="0" :max="100" :precision="2" :step="0.5" style="width:180px" />
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="editForm.status">
            <el-radio value="active">正常</el-radio>
            <el-radio value="disabled">禁用</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="editForm.remark" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="doEdit">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog title="重置代理密码" v-model="pwdVisible" width="420px">
      <el-form label-width="90px">
        <el-form-item label="代理"><el-input :value="resetRow?.username" disabled /></el-form-item>
        <el-form-item label="新密码"><el-input v-model="newPwd" type="password" show-password placeholder="至少6个字符" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="pwdVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="doReset">确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getAgentList, createAgent, updateAgent, resetAgentPassword } from '@/api'

const router = useRouter()
const loading = ref(false), saving = ref(false)
const list = ref([]), page = ref(1), ps = ref(20), total = ref(0)
const qf = reactive({ keyword: '', status: '' })

const loadList = async () => {
  loading.value = true
  try {
    const res = await getAgentList({ ...qf, page: page.value, pageSize: ps.value })
    list.value = res.data.list || []
    total.value = res.data.total || 0
  } catch (e) { ElMessage.error(e.message || '加载失败') }
  loading.value = false
}
loadList()

const resetQuery = () => { qf.keyword = ''; qf.status = ''; page.value = 1; loadList() }
const goDetail = (row) => router.push('/agent/' + row._id)
const fmt = (t) => t ? new Date(t).toLocaleString('zh-CN') : ''

const createVisible = ref(false)
const createForm = reactive({ username: '', password: '', commissionRate: 2.5, remark: '' })
const openCreate = () => {
  Object.assign(createForm, { username: '', password: '', commissionRate: 2.5, remark: '' })
  createVisible.value = true
}
const doCreate = async () => {
  if (!createForm.username || createForm.username.length < 3) return ElMessage.warning('用户名至少3个字符')
  if (!createForm.password || createForm.password.length < 6) return ElMessage.warning('密码至少6个字符')
  saving.value = true
  try {
    await createAgent({ ...createForm })
    createVisible.value = false
    ElMessage.success('代理已创建')
    loadList()
  } catch (e) { ElMessage.error(e.message || '创建失败') }
  saving.value = false
}

const editVisible = ref(false), editForm = reactive({ _id: '', username: '', commissionRate: 0, status: 'active', remark: '' })
const openEdit = (row) => {
  Object.assign(editForm, {
    _id: row._id, username: row.username,
    commissionRate: Number(row.commissionRate || 0),
    status: row.status || 'active', remark: row.remark || ''
  })
  editVisible.value = true
}
const doEdit = async () => {
  saving.value = true
  try {
    await updateAgent(editForm._id, {
      commissionRate: editForm.commissionRate,
      status: editForm.status,
      remark: editForm.remark
    })
    editVisible.value = false
    ElMessage.success('代理已更新')
    loadList()
  } catch (e) { ElMessage.error(e.message || '保存失败') }
  saving.value = false
}

const pwdVisible = ref(false), resetRow = ref(null), newPwd = ref('')
const openReset = (row) => { resetRow.value = row; newPwd.value = ''; pwdVisible.value = true }
const doReset = async () => {
  if (!newPwd.value || newPwd.value.length < 6) return ElMessage.warning('密码至少6个字符')
  saving.value = true
  try {
    await resetAgentPassword(resetRow.value._id, newPwd.value)
    pwdVisible.value = false
    ElMessage.success('密码已重置')
  } catch (e) { ElMessage.error(e.message || '重置失败') }
  saving.value = false
}

const toggleStatus = async (row) => {
  const next = row.status === 'active' ? 'disabled' : 'active'
  try {
    await updateAgent(row._id, { status: next })
    ElMessage.success(next === 'active' ? '已启用' : '已禁用')
    loadList()
  } catch (e) { ElMessage.error(e.message || '操作失败') }
}
</script>

<style lang="scss" scoped>
.agent-page .page-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; h2 { margin:0; } }
.profit { color: #2e7d32; font-weight: 600; }
.loss { color: #d32f2f; font-weight: 600; }
.tip { margin-left: 12px; color: #909399; font-size: 12px; }
</style>
