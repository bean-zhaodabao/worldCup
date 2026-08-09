<template>
  <div class="match-page">
    <div class="page-header">
      <h2>赛事管理</h2>
      <el-button type="primary" @click="openDialog(null)">新增赛事</el-button>
    </div>

    <el-card style="margin-bottom:16px">
      <el-form :inline="true" :model="qf">
        <el-form-item label="名称"><el-input v-model="qf.name" placeholder="搜索" clearable /></el-form-item>
        <el-form-item label="状态">
          <el-select v-model="qf.status" placeholder="全部" clearable style="width:120px">
            <el-option label="未开始" value="upcoming" /><el-option label="进行中" value="live" />
            <el-option label="已结束" value="finished" /><el-option label="已结算" value="settled" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" icon="Search" @click="loadList">搜索</el-button>
          <el-button icon="Refresh" @click="qf.name='';qf.status='';loadList()">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card>
      <el-table :data="list" border stripe v-loading="loading">
        <el-table-column prop="name" label="赛事名称" min-width="160" />
        <el-table-column label="主队" width="120"><template #default="{row}"><span>{{ row.teamA }}</span></template></el-table-column>
        <el-table-column label="客队" width="120"><template #default="{row}"><span>{{ row.teamB }}</span></template></el-table-column>
        <el-table-column label="开始时间" width="160"><template #default="{row}">{{ fmt(row.startTime) }}</template></el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{row}"><el-tag :type="tagType(row.status)">{{ statusText(row.status) }}</el-tag></template>
        </el-table-column>
        <el-table-column label="操作" width="360" fixed="right">
          <template #default="{row}">
            <el-button size="small" @click="$router.push('/match/'+row._id+'/plays')">玩法</el-button>
            <el-button size="small" type="warning" @click="advanceStatus(row)" v-if="row.status!=='settled'">{{ actionLabel(row.status) }}</el-button>
            <el-button size="small" @click="openDialog(row)">编辑</el-button>
            <el-popconfirm title="确定删除？已有订单的赛事将下架处理" @confirm="doDelete(row)"><template #reference><el-button size="small" type="danger">删除</el-button></template></el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination v-model:current-page="page" v-model:page-size="ps" :total="total" layout="total,prev,pager,next" style="margin-top:16px;justify-content:flex-end" @change="loadList" />
    </el-card>

    <!-- 新增/编辑弹窗 -->
    <el-dialog :title="dialogTitle" v-model="dialogVisible" width="520px" @closed="resetForm">
      <el-form :model="form" :rules="rules" ref="formRef" label-width="100px">
        <el-form-item label="赛事名称" prop="name"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="主队" prop="teamA"><el-input v-model="form.teamA" /></el-form-item>
        <el-form-item label="客队" prop="teamB"><el-input v-model="form.teamB" /></el-form-item>
        <el-form-item label="主队国旗URL"><el-input v-model="form.teamAFlag" placeholder="可选" /></el-form-item>
        <el-form-item label="客队国旗URL"><el-input v-model="form.teamBFlag" placeholder="可选" /></el-form-item>
        <el-form-item label="开始时间" prop="startTime">
          <el-date-picker v-model="form.startTime" type="datetime" placeholder="选择时间" style="width:100%" value-format="YYYY-MM-DD HH:mm:ss" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible=false">取消</el-button>
        <el-button type="primary" @click="doSave" :loading="saving">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getMatchList, createMatch, updateMatch, deleteMatch, updateMatchStatus } from '@/api'

const loading = ref(false), saving = ref(false)
const list = ref([]), page = ref(1), ps = ref(20), total = ref(0)
const qf = reactive({ name: '', status: '' })

const loadList = async () => {
  loading.value = true
  try {
    const res = await getMatchList({ ...qf, page: page.value, pageSize: ps.value })
    list.value = res.data.list || []; total.value = res.data.total || 0
  } catch (e) { console.error(e) }
  loading.value = false
}
loadList()

const dialogVisible = ref(false), isEdit = ref(false), editId = ref('')
const formRef = ref(null)
const form = reactive({ name: '', teamA: '', teamB: '', teamAFlag: '', teamBFlag: '', startTime: '' })
const rules = {
  name: [{ required: true, message: '必填' }], teamA: [{ required: true, message: '必填' }],
  teamB: [{ required: true, message: '必填' }], startTime: [{ required: true, message: '必填' }]
}
const dialogTitle = computed(() => isEdit.value ? '编辑赛事' : '新增赛事')

const openDialog = (row) => {
  isEdit.value = !!row
  if (row) {
    editId.value = row._id
    Object.assign(form, { name: row.name, teamA: row.teamA, teamB: row.teamB, teamAFlag: row.teamAFlag || '', teamBFlag: row.teamBFlag || '', startTime: fmt(row.startTime) })
  } else { editId.value = ''; resetForm() }
  dialogVisible.value = true
}
const resetForm = () => Object.assign(form, { name: '', teamA: '', teamB: '', teamAFlag: '', teamBFlag: '', startTime: '' })

const doSave = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  try {
    if (isEdit.value) { await updateMatch(editId.value, { ...form }); ElMessage.success('更新成功') }
    else { await createMatch({ ...form }); ElMessage.success('创建成功') }
    dialogVisible.value = false; loadList()
  } catch (e) { ElMessage.error(e.message || '操作失败') }
  saving.value = false
}
const doDelete = async (row) => {
  try { await deleteMatch(row._id); ElMessage.success('已删除'); loadList() }
  catch (e) { ElMessage.error(e.message || '删除失败') }
}

const statusFlow = { upcoming: 'live', live: 'finished', finished: 'settled' }
const actionLabel = (s) => ({ upcoming: '开始比赛', live: '结束比赛', finished: '结算' }[s] || '')
const advanceStatus = async (row) => {
  const next = statusFlow[row.status]
  if (!next) return
  try {
    await ElMessageBox.confirm('确认将状态从"' + statusText(row.status) + '"变更为"' + statusText(next) + '"?', '状态变更', { type: 'warning' })
    await updateMatchStatus(row._id, next); ElMessage.success('状态已更新'); loadList()
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.message || '操作失败') }
}
const statusText = (s) => ({ upcoming:'未开始', live:'进行中', finished:'已结束', settled:'已结算' }[s])
const tagType = (s) => ({ upcoming:'info', live:'success', finished:'warning', settled:'info' }[s])
const fmt = (t) => t ? new Date(t).toLocaleString('zh-CN') : ''
</script>

<style lang="scss" scoped>
.match-page .page-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; h2 { margin:0; } }
</style>
